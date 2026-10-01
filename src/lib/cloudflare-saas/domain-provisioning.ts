import type { CloudflareCustomHostname } from "./core.ts";
import { validateClaimHostname } from "../domain-claims/core.ts";

export const CLOUDFLARE_PROVISIONING_LEASE_MS = 30_000;

export function evaluateCloudflareQuota(input: {
  providerCount: number;
  localProviderBoundCount: number;
  pendingReservationCount: number;
  freeHostnameLimit: number;
}) {
  const observedBoundCount = Math.max(
    input.providerCount,
    input.localProviderBoundCount
  );
  return (
    observedBoundCount + input.pendingReservationCount >=
    input.freeHostnameLimit
  );
}

export type DomainProvisioningReservation =
  | {
      kind: "in_progress";
      hostname: string;
    }
  | {
      kind: "ready";
      claimId: number;
      domainId: number;
      hostname: string;
      tenantId: number;
      providerHostnameId: string | null;
      claimAlreadyConsumed: boolean;
    };

export type DomainProvisioningFinalizeResult = {
  claimId: number;
  domainId: number;
  hostname: string;
  tenantId: number;
  providerHostnameId: string;
  claimConsumedAt: Date;
};

export interface CloudflareDomainProvisioningRepository {
  preflightVerifiedClaim(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
  }): Promise<void>;

  reserveVerifiedClaim(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
    providerCount: number;
    freeHostnameLimit: number;
    needsProviderCreate: boolean;
    leaseMs: number;
    now: Date;
  }): Promise<DomainProvisioningReservation>;

  finalizeProvisioning(input: {
    claimId: number;
    domainId: number;
    hostname: string;
    tenantId: number;
    providerHostname: CloudflareCustomHostname;
    now: Date;
  }): Promise<DomainProvisioningFinalizeResult>;

  recordProvisioningError(input: {
    domainId: number;
    errorCode: string;
    now: Date;
  }): Promise<void>;
}

export interface CloudflareDomainProvisioningProvider {
  listCustomHostnames(): Promise<CloudflareCustomHostname[]>;
  findCustomHostnameByHostname(
    hostname: string
  ): Promise<CloudflareCustomHostname[]>;
  getCustomHostname(id: string): Promise<CloudflareCustomHostname>;
  createCustomHostname(hostname: string): Promise<CloudflareCustomHostname>;
}

export type CloudflareDomainProvisioningResult =
  | {
      kind: "in_progress";
      hostname: string;
    }
  | {
      kind: "provisioned";
      hostname: string;
      providerHostnameId: string;
      providerHostnameStatus: string;
      providerSslStatus: string | null;
      cnameTarget: string;
      claimConsumedAt: Date;
    };

export class CloudflareDomainProvisioningError extends Error {
  constructor(
    readonly code:
      | "AMBIGUOUS_PROVIDER_HOSTNAME"
      | "PROVIDER_HOSTNAME_MISMATCH"
      | "PROVIDER_QUOTA_EXHAUSTED"
      | "CLAIM_NOT_VERIFIED"
      | "CNAME_NOT_VERIFIED"
      | "STORE_NOT_PROVISIONED"
      | "TENANT_NOT_ACTIVE"
      | "DOMAIN_CONFLICT"
      | "CUSTOM_DOMAIN_PLAN_REQUIRED",
    message: string
  ) {
    super(message);
    this.name = "CloudflareDomainProvisioningError";
  }
}

function exactProviderMatch(
  matches: CloudflareCustomHostname[],
  hostname: string
) {
  const exact = matches.filter((match) => match.hostname === hostname);
  if (exact.length > 1) {
    throw new CloudflareDomainProvisioningError(
      "AMBIGUOUS_PROVIDER_HOSTNAME",
      "Cloudflare returned multiple exact custom hostnames"
    );
  }
  return exact[0] ?? null;
}

function safeProvisioningErrorCode(error: unknown) {
  if (error instanceof CloudflareDomainProvisioningError) {
    return error.code;
  }
  if (error instanceof Error && error.name === "CloudflareSaasError") {
    return "CLOUDFLARE_PROVIDER_ERROR";
  }
  return "CLOUDFLARE_PROVISIONING_ERROR";
}

export class CloudflareDomainProvisioningService {
  constructor(
    private readonly repository: CloudflareDomainProvisioningRepository,
    private readonly provider: CloudflareDomainProvisioningProvider,
    private readonly freeHostnameLimit: number,
    private readonly cnameTarget: string
  ) {}

  async provisionVerifiedClaim(
    merchantId: number,
    storeId: number,
    value: unknown,
    now = new Date()
  ): Promise<CloudflareDomainProvisioningResult> {
    const hostname = validateClaimHostname(value);

    await this.repository.preflightVerifiedClaim({
      merchantId,
      storeId,
      hostname,
    });

    const initialMatches =
      await this.provider.findCustomHostnameByHostname(hostname);
    let providerHostname = exactProviderMatch(initialMatches, hostname);

    let providerCount = 0;
    const needsProviderCreate = providerHostname === null;

    if (needsProviderCreate) {
      const providerHostnames = await this.provider.listCustomHostnames();
      providerCount = providerHostnames.length;
    }

    const reservation = await this.repository.reserveVerifiedClaim({
      merchantId,
      storeId,
      hostname,
      providerCount,
      freeHostnameLimit: this.freeHostnameLimit,
      needsProviderCreate,
      leaseMs: CLOUDFLARE_PROVISIONING_LEASE_MS,
      now,
    });

    if (reservation.kind === "in_progress") {
      return {
        kind: "in_progress",
        hostname: reservation.hostname,
      };
    }

    try {
      if (reservation.providerHostnameId) {
        providerHostname = await this.provider.getCustomHostname(
          reservation.providerHostnameId
        );
      } else if (!providerHostname) {
        try {
          providerHostname = await this.provider.createCustomHostname(hostname);
        } catch (error) {
          const reconciled = exactProviderMatch(
            await this.provider.findCustomHostnameByHostname(hostname),
            hostname
          );
          if (!reconciled) throw error;
          providerHostname = reconciled;
        }
      }

      if (!providerHostname || providerHostname.hostname !== hostname) {
        throw new CloudflareDomainProvisioningError(
          "PROVIDER_HOSTNAME_MISMATCH",
          "Cloudflare custom hostname does not match verified claim"
        );
      }

      const finalized = await this.repository.finalizeProvisioning({
        claimId: reservation.claimId,
        domainId: reservation.domainId,
        hostname,
        tenantId: reservation.tenantId,
        providerHostname,
        now,
      });

      return {
        kind: "provisioned",
        hostname,
        providerHostnameId: finalized.providerHostnameId,
        providerHostnameStatus: providerHostname.status,
        providerSslStatus: providerHostname.sslStatus,
        cnameTarget: this.cnameTarget,
        claimConsumedAt: finalized.claimConsumedAt,
      };
    } catch (error) {
      await this.repository.recordProvisioningError({
        domainId: reservation.domainId,
        errorCode: safeProvisioningErrorCode(error),
        now,
      });
      throw error;
    }
  }
}
