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
      | "LIFECYCLE_BUSY",
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
    private readonly clearDomainCache: () => void
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
}
