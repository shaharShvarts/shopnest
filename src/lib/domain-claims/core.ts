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
export const DOMAIN_MANUAL_CHECK_COOLDOWN_MS = 60_000;
export const SHOPNEST_CUSTOM_DOMAIN_CNAME_TARGET =
  "customers.shopnest.co.il";
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
  cnameVerifiedAt: Date | null;
  lastTxtCheckAt: Date | null;
  lastCnameCheckAt: Date | null;
  consumedAt: Date | null;
};

export type ClaimCheckReservation =
  | { kind: "not_found" }
  | { kind: "expired"; claim: StoreDomainClaimRecord }
  | { kind: "not_verified"; claim: StoreDomainClaimRecord }
  | {
      kind: "cooldown";
      claim: StoreDomainClaimRecord;
      nextAllowedAt: Date;
    }
  | { kind: "ready"; claim: StoreDomainClaimRecord };

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

  reserveTxtCheck(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
    now: Date;
    cooldownMs: number;
  }): Promise<ClaimCheckReservation>;

  reserveCnameCheck(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
    now: Date;
    cooldownMs: number;
  }): Promise<ClaimCheckReservation>;

  markExpired(id: number, now: Date): Promise<void>;

  markVerified(input: {
    id: number;
    expectedTokenHash: string;
    now: Date;
  }): Promise<StoreDomainClaimRecord | null>;

  markCnameVerified(input: {
    id: number;
    now: Date;
  }): Promise<StoreDomainClaimRecord | null>;
}

export interface TxtResolver {
  resolveTxt(name: string): Promise<string[][]>;
  resolveCname(name: string): Promise<string[]>;
  resolveSoa(name: string): Promise<unknown>;
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
  | { kind: "cooldown"; hostname: string; nextAllowedAt: Date }
  | { kind: "verified"; hostname: string; verifiedAt: Date };

export type DomainCnameVerifyResult =
  | { kind: "not_found" }
  | { kind: "expired"; hostname: string }
  | { kind: "not_verified"; hostname: string }
  | { kind: "pending"; hostname: string; nextAllowedAt: Date }
  | { kind: "cooldown"; hostname: string; nextAllowedAt: Date }
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

function canonicalDnsTarget(value: string) {
  return value.trim().toLowerCase().replace(/\.$/, "");
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

    try {
      await this.resolver.resolveSoa(hostname);
      throw new Error(
        "Custom domain must be a subdomain; DNS zone apex domains are not supported"
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message ===
          "Custom domain must be a subdomain; DNS zone apex domains are not supported"
      ) {
        throw error;
      }

      const code =
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : null;

      if (
        code !== "ENODATA" &&
        code !== "ENOTFOUND" &&
        code !== "NXDOMAIN"
      ) {
        throw new Error(
          "Unable to determine whether custom domain is a DNS zone apex"
        );
      }
    }

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
    const reservation = await this.repository.reserveTxtCheck({
      merchantId,
      storeId,
      hostname,
      now,
      cooldownMs: DOMAIN_MANUAL_CHECK_COOLDOWN_MS,
    });

    if (reservation.kind === "not_found") return { kind: "not_found" };
    if (reservation.kind === "expired") return { kind: "expired", hostname };
    if (reservation.kind === "cooldown") {
      return {
        kind: "cooldown",
        hostname,
        nextAllowedAt: reservation.nextAllowedAt,
      };
    }
    if (reservation.kind !== "ready") return { kind: "not_found" };

    const claim = reservation.claim;
    let records: string[][];
    try {
      records = await this.resolver.resolveTxt(domainClaimDnsName(hostname));
    } catch {
      return { kind: "pending", hostname };
    }

    const matched = records.some((chunks) => {
      const dnsValue = chunks.join("");
      if (!dnsValue.startsWith(DOMAIN_CLAIM_VALUE_PREFIX)) return false;
      const token = dnsValue.slice(DOMAIN_CLAIM_VALUE_PREFIX.length);
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

  async verifyCname(
    merchantId: number,
    storeId: number,
    value: unknown,
    now = new Date()
  ): Promise<DomainCnameVerifyResult> {
    const hostname = validateClaimHostname(value);
    const reservation = await this.repository.reserveCnameCheck({
      merchantId,
      storeId,
      hostname,
      now,
      cooldownMs: DOMAIN_MANUAL_CHECK_COOLDOWN_MS,
    });

    if (reservation.kind === "not_found") return { kind: "not_found" };
    if (reservation.kind === "expired") return { kind: "expired", hostname };
    if (reservation.kind === "not_verified") {
      return { kind: "not_verified", hostname };
    }
    if (reservation.kind === "cooldown") {
      return {
        kind: "cooldown",
        hostname,
        nextAllowedAt: reservation.nextAllowedAt,
      };
    }

    const nextAllowedAt = new Date(
      now.getTime() + DOMAIN_MANUAL_CHECK_COOLDOWN_MS
    );

    let answers: string[];
    try {
      answers = await this.resolver.resolveCname(hostname);
    } catch {
      return { kind: "pending", hostname, nextAllowedAt };
    }

    const directTarget =
      answers.length === 1 ? canonicalDnsTarget(answers[0] ?? "") : "";
    if (directTarget !== SHOPNEST_CUSTOM_DOMAIN_CNAME_TARGET) {
      return { kind: "pending", hostname, nextAllowedAt };
    }

    const verified = await this.repository.markCnameVerified({
      id: reservation.claim.id,
      now,
    });
    if (!verified?.cnameVerifiedAt) {
      return { kind: "pending", hostname, nextAllowedAt };
    }

    return {
      kind: "verified",
      hostname,
      verifiedAt: verified.cnameVerifiedAt,
    };
  }
}
