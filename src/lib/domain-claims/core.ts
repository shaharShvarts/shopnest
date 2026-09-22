import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  canonicalCloudflareHostname,
} from "../cloudflare-saas/core.ts";
import { isPlatformHostname } from "../domain-registry/core.ts";

export const DOMAIN_CLAIM_TTL_MS = 24 * 60 * 60 * 1000;
export const CUSTOM_DOMAIN_PLAN_CODES = ["medium", "large"] as const;
export type CustomDomainPlanCode =
  (typeof CUSTOM_DOMAIN_PLAN_CODES)[number];

export function planAllowsCustomDomain(value: unknown): value is CustomDomainPlanCode {
  return (
    typeof value === "string" &&
    (CUSTOM_DOMAIN_PLAN_CODES as readonly string[]).includes(value)
  );
}
export const DOMAIN_CLAIM_TXT_PREFIX = "_shopnest-verification";
export const DOMAIN_CLAIM_VALUE_PREFIX = "shopnest-verification=";

export type StoreDomainClaimRecord = {
  id: number;
  storeId: number;
  hostname: string;
  status:
    | "pending_verification"
    | "verified"
    | "expired"
    | "consumed"
    | "cancelled";
  verificationTokenHash: string;
  expiresAt: Date;
  verifiedAt: Date | null;
  consumedAt: Date | null;
};

export interface StoreDomainClaimRepository {
  createPendingForOwnedStore(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
    verificationTokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<StoreDomainClaimRecord | null>;

  findPendingForOwnedStore(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
  }): Promise<StoreDomainClaimRecord | null>;

  markExpired(id: number, now: Date): Promise<void>;

  markVerified(input: {
    id: number;
    expectedTokenHash: string;
    now: Date;
  }): Promise<StoreDomainClaimRecord | null>;
}

export interface TxtResolver {
  resolveTxt(name: string): Promise<string[][]>;
}

export type DomainClaimStartResult = {
  claimId: number;
  hostname: string;
  dnsName: string;
  dnsValue: string;
  expiresAt: Date;
};

export type DomainClaimVerifyResult =
  | { kind: "not_found" }
  | { kind: "expired"; hostname: string }
  | { kind: "pending"; hostname: string }
  | { kind: "verified"; hostname: string; verifiedAt: Date };

export function domainClaimDnsName(hostname: string) {
  return `${DOMAIN_CLAIM_TXT_PREFIX}.${hostname}`;
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function safeHashEquals(leftHex: string, rightHex: string) {
  if (!/^[a-f0-9]{64}$/.test(leftHex) || !/^[a-f0-9]{64}$/.test(rightHex)) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(leftHex, "hex"),
    Buffer.from(rightHex, "hex")
  );
}

export function validateClaimHostname(value: unknown): string {
  const hostname = canonicalCloudflareHostname(value);
  if (!hostname || isPlatformHostname(hostname)) {
    throw new Error("Custom domain hostname is not allowed");
  }

  if (domainClaimDnsName(hostname).length > 253) {
    throw new Error("Custom domain hostname is too long for DNS verification");
  }

  return hostname;
}

export class DomainOwnershipClaimService {
  constructor(
    private readonly repository: StoreDomainClaimRepository,
    private readonly resolver: TxtResolver,
    private readonly tokenFactory: () => string = () =>
      randomBytes(32).toString("base64url")
  ) {}

  async startClaim(
    merchantId: number,
    storeId: number,
    value: unknown,
    now = new Date()
  ): Promise<DomainClaimStartResult> {
    const hostname = validateClaimHostname(value);
    const token = this.tokenFactory();
    if (!token || token.length < 32) {
      throw new Error("Domain verification token generation failed");
    }

    const expiresAt = new Date(now.getTime() + DOMAIN_CLAIM_TTL_MS);
    const verificationTokenHash = sha256Hex(token);

    const claim = await this.repository.createPendingForOwnedStore({
      merchantId,
      storeId,
      hostname,
      verificationTokenHash,
      expiresAt,
      now,
    });

    if (!claim) {
      throw new Error("Owned Store not found");
    }

    return {
      claimId: claim.id,
      hostname,
      dnsName: domainClaimDnsName(hostname),
      dnsValue: `${DOMAIN_CLAIM_VALUE_PREFIX}${token}`,
      expiresAt,
    };
  }

  async verifyClaim(
    merchantId: number,
    storeId: number,
    value: unknown,
    now = new Date()
  ): Promise<DomainClaimVerifyResult> {
    const hostname = validateClaimHostname(value);
    const claim = await this.repository.findPendingForOwnedStore({
      merchantId,
      storeId,
      hostname,
    });

    if (!claim) return { kind: "not_found" };

    if (claim.expiresAt.getTime() <= now.getTime()) {
      await this.repository.markExpired(claim.id, now);
      return { kind: "expired", hostname };
    }

    let records: string[][];
    try {
      records = await this.resolver.resolveTxt(domainClaimDnsName(hostname));
    } catch {
      return { kind: "pending", hostname };
    }

    const matched = records.some((chunks) => {
      const value = chunks.join("");
      if (!value.startsWith(DOMAIN_CLAIM_VALUE_PREFIX)) return false;
      const token = value.slice(DOMAIN_CLAIM_VALUE_PREFIX.length);
      return safeHashEquals(sha256Hex(token), claim.verificationTokenHash);
    });

    if (!matched) return { kind: "pending", hostname };

    const verified = await this.repository.markVerified({
      id: claim.id,
      expectedTokenHash: claim.verificationTokenHash,
      now,
    });

    if (!verified) return { kind: "pending", hostname };

    return {
      kind: "verified",
      hostname,
      verifiedAt: verified.verifiedAt ?? now,
    };
  }
}
