import type { CloudflareDomainSyncResult } from "../cloudflare-saas/domain-sync.ts";

export const DOMAIN_PROVIDER_CHECK_COOLDOWN_MS = 60_000;
export const CUSTOM_DOMAIN_RETIREMENT_MS = 24 * 60 * 60 * 1000;

export type OwnedCandidateCheckReservation =
  | { kind: "not_found" }
  | {
      kind: "cooldown";
      hostname: string;
      nextAllowedAt: Date;
    }
  | {
      kind: "ready";
      candidateId: number;
      hostname: string;
      tenantId: number;
    };

export type DomainCutoverResult = {
  hostname: string;
  replacedHostname: string | null;
};

export type RetirementCleanupReservation =
  | { kind: "none" }
  | {
      kind: "ready";
      domainId: number;
      hostname: string;
      providerHostnameId: string | null;
    };

export type DomainRollbackResult = {
  restoredHostname: string;
  retiringHostname: string;
};

export interface DomainCleanupService {
  cleanupReservation(
    reservation: Extract<RetirementCleanupReservation, { kind: "ready" }>,
    now?: Date
  ): Promise<void>;
}

export interface CustomDomainLifecycleRepository {
  reserveOwnedCandidateCheck(input: {
    merchantId: number;
    storeId: number;
    now: Date;
    cooldownMs: number;
  }): Promise<OwnedCandidateCheckReservation>;

  activateReadyCandidate(input: {
    merchantId: number;
    storeId: number;
    candidateId: number;
    now: Date;
    retirementMs: number;
  }): Promise<DomainCutoverResult>;

  reserveExpiredRetiringForOwnedStore(input: {
    merchantId: number;
    storeId: number;
    now: Date;
  }): Promise<RetirementCleanupReservation>;

  reserveExpiredRetiringForTenantSlug(input: {
    tenantSlug: string;
    now: Date;
  }): Promise<RetirementCleanupReservation>;

  rollbackRetiringDomain(input: {
    tenantSlug: string;
    restoreHostname: string;
    now: Date;
    retirementMs: number;
  }): Promise<DomainRollbackResult>;
}

export interface DomainSyncService {
  syncByHostname(
    hostname: string,
    now?: Date
  ): Promise<CloudflareDomainSyncResult>;
}

export type ManualProviderCheckResult =
  | { kind: "not_found" }
  | { kind: "cooldown"; nextAllowedAt: Date }
  | {
      kind: "pending";
      hostname: string;
      providerHostnameStatus: string;
      providerSslStatus: string | null;
      nextAllowedAt: Date;
    }
  | {
      kind: "activated";
      hostname: string;
      replacedHostname: string | null;
    };

export class CustomDomainLifecycleError extends Error {
  constructor(
    readonly code:
      | "ELIGIBILITY_CHANGED"
      | "CANDIDATE_CONFLICT"
      | "CANDIDATE_NOT_MANAGED"
      | "LIFECYCLE_BUSY"
      | "ROLLBACK_NOT_AVAILABLE",
    message: string
  ) {
    super(message);
    this.name = "CustomDomainLifecycleError";
  }
}

export class CustomDomainLifecycleService {
  constructor(
    private readonly repository: CustomDomainLifecycleRepository,
    private readonly syncService: DomainSyncService,
    private readonly clearDomainCache: () => void,
    private readonly cleanupService?: DomainCleanupService
  ) {}

  async checkOwnedCandidate(
    merchantId: number,
    storeId: number,
    now = new Date()
  ): Promise<ManualProviderCheckResult> {
    const reservation = await this.repository.reserveOwnedCandidateCheck({
      merchantId,
      storeId,
      now,
      cooldownMs: DOMAIN_PROVIDER_CHECK_COOLDOWN_MS,
    });

    if (reservation.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (reservation.kind === "cooldown") {
      return {
        kind: "cooldown",
        nextAllowedAt: reservation.nextAllowedAt,
      };
    }

    const synced = await this.syncService.syncByHostname(
      reservation.hostname,
      now
    );

    if (synced.kind !== "synced") {
      throw new CustomDomainLifecycleError(
        "CANDIDATE_NOT_MANAGED",
        "Candidate custom domain is no longer provider-managed"
      );
    }

    if (!synced.ready) {
      return {
        kind: "pending",
        hostname: synced.hostname,
        providerHostnameStatus: synced.providerHostnameStatus,
        providerSslStatus: synced.providerSslStatus,
        nextAllowedAt: new Date(
          now.getTime() + DOMAIN_PROVIDER_CHECK_COOLDOWN_MS
        ),
      };
    }

    const cutover = await this.repository.activateReadyCandidate({
      merchantId,
      storeId,
      candidateId: reservation.candidateId,
      now,
      retirementMs: CUSTOM_DOMAIN_RETIREMENT_MS,
    });

    this.clearDomainCache();

    return {
      kind: "activated",
      hostname: cutover.hostname,
      replacedHostname: cutover.replacedHostname,
    };
  }

  async cleanupExpiredRetiringForOwnedStore(
    merchantId: number,
    storeId: number,
    now = new Date()
  ) {
    const reservation =
      await this.repository.reserveExpiredRetiringForOwnedStore({
        merchantId,
        storeId,
        now,
      });

    return this.cleanupRetirementReservation(reservation, now);
  }

  async cleanupExpiredRetiringForTenantSlug(
    tenantSlug: string,
    now = new Date()
  ) {
    const reservation =
      await this.repository.reserveExpiredRetiringForTenantSlug({
        tenantSlug,
        now,
      });

    return this.cleanupRetirementReservation(reservation, now);
  }

  async rollbackRetiringDomainForAdmin(
    tenantSlug: string,
    restoreHostname: string,
    now = new Date()
  ): Promise<DomainRollbackResult> {
    const result = await this.repository.rollbackRetiringDomain({
      tenantSlug,
      restoreHostname,
      now,
      retirementMs: CUSTOM_DOMAIN_RETIREMENT_MS,
    });
    this.clearDomainCache();
    return result;
  }

  private async cleanupRetirementReservation(
    reservation: RetirementCleanupReservation,
    now: Date
  ) {
    if (reservation.kind === "none") {
      return { kind: "none" as const };
    }

    if (!this.cleanupService) {
      throw new Error("Custom-domain cleanup service is unavailable");
    }

    // The repository has already made the domain locally non-routable.
    // Clear all cached host/tenant-domain decisions before external cleanup.
    this.clearDomainCache();
    await this.cleanupService.cleanupReservation(reservation, now);

    return {
      kind: "cleaned" as const,
      hostname: reservation.hostname,
    };
  }

}
