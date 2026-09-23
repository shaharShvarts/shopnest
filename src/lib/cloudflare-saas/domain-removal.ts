import { validateClaimHostname } from "../domain-claims/core.ts";
import { CloudflareSaasError } from "./client.ts";

export type DomainRemovalReservation =
  | {
      kind: "ready";
      domainId: number;
      hostname: string;
      providerHostnameId: string | null;
    }
  | {
      kind: "already_removed";
      hostname: string;
    };

export interface CloudflareDomainRemovalRepository {
  prepareRemoval(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
    now: Date;
  }): Promise<DomainRemovalReservation>;

  finalizeRemoval(input: {
    domainId: number;
    now: Date;
  }): Promise<void>;

  recordRemovalError(input: {
    domainId: number;
    errorCode: string;
    now: Date;
  }): Promise<void>;
}

export interface CloudflareDomainRemovalProvider {
  deleteCustomHostname(id: string): Promise<void>;
}

export type CloudflareDomainRemovalResult =
  | { kind: "removed"; hostname: string }
  | { kind: "already_removed"; hostname: string };

export class CloudflareDomainRemovalError extends Error {
  constructor(
    readonly code: "DOMAIN_NOT_FOUND" | "DOMAIN_CONFLICT",
    message: string
  ) {
    super(message);
    this.name = "CloudflareDomainRemovalError";
  }
}

export class CloudflareDomainRemovalService {
  constructor(
    private readonly repository: CloudflareDomainRemovalRepository,
    private readonly provider: CloudflareDomainRemovalProvider,
    private readonly clearDomainCache: (hostname: string) => void
  ) {}

  async removeOwnedDomain(
    merchantId: number,
    storeId: number,
    value: unknown,
    now = new Date()
  ): Promise<CloudflareDomainRemovalResult> {
    const hostname = validateClaimHostname(value);
    const reservation = await this.repository.prepareRemoval({
      merchantId,
      storeId,
      hostname,
      now,
    });

    if (reservation.kind === "already_removed") {
      return reservation;
    }

    this.clearDomainCache(reservation.hostname);

    if (reservation.providerHostnameId) {
      try {
        await this.provider.deleteCustomHostname(
          reservation.providerHostnameId
        );
      } catch (error) {
        if (
          !(
            error instanceof CloudflareSaasError &&
            error.kind === "http_error" &&
            error.status === 404
          )
        ) {
          await this.repository.recordRemovalError({
            domainId: reservation.domainId,
            errorCode: "CLOUDFLARE_DELETE_ERROR",
            now,
          });
          throw error;
        }
      }
    }

    await this.repository.finalizeRemoval({
      domainId: reservation.domainId,
      now,
    });

    return {
      kind: "removed",
      hostname: reservation.hostname,
    };
  }
}
