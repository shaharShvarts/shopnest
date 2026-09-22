import {
  isCloudflareCustomHostnameReady,
  type CloudflareCustomHostname,
} from "./core.ts";

export type CloudflareDomainSyncRecord = {
  id: number;
  hostname: string;
  domainStatus:
    | "pending_verification"
    | "verified"
    | "active"
    | "failed"
    | "removed";
  provider: "cloudflare" | null;
  providerHostnameId: string | null;
  tenantStatus: "active" | "suspended" | "disabled";
};

export type CloudflareDomainSyncUpdate = {
  providerHostnameStatus: string;
  providerSslStatus: string | null;
  providerLastSyncedAt: Date;
  providerLastErrorCode: null;
  providerLastErrorAt: null;
  domainStatus?:
    | "pending_verification"
    | "verified"
    | "active"
    | "failed"
    | "removed";
  verifiedAt?: Date;
};

export interface CloudflareDomainSyncRepository {
  findByHostname(hostname: string): Promise<CloudflareDomainSyncRecord | null>;
  applySync(
    id: number,
    update: CloudflareDomainSyncUpdate
  ): Promise<CloudflareDomainSyncRecord>;
  recordProviderError(
    id: number,
    errorCode: string,
    now: Date
  ): Promise<void>;
}

export interface CloudflareDomainSyncProvider {
  getCustomHostname(id: string): Promise<CloudflareCustomHostname>;
}

export type CloudflareDomainSyncResult =
  | { kind: "not_found" }
  | { kind: "not_managed"; hostname: string }
  | {
      kind: "synced";
      hostname: string;
      providerHostnameStatus: string;
      providerSslStatus: string | null;
      ready: boolean;
      domainStatus: CloudflareDomainSyncRecord["domainStatus"];
    };

export class CloudflareDomainSyncService {
  constructor(
    private readonly repository: CloudflareDomainSyncRepository,
    private readonly provider: CloudflareDomainSyncProvider,
    private readonly clearDomainCache: (hostname: string) => void
  ) {}

  async syncByHostname(
    hostname: string,
    now = new Date()
  ): Promise<CloudflareDomainSyncResult> {
    const record = await this.repository.findByHostname(hostname);
    if (!record) return { kind: "not_found" };

    if (
      record.provider !== "cloudflare" ||
      !record.providerHostnameId ||
      record.domainStatus === "removed"
    ) {
      return { kind: "not_managed", hostname: record.hostname };
    }

    try {
      const providerHostname = await this.provider.getCustomHostname(
        record.providerHostnameId
      );

      if (providerHostname.hostname !== record.hostname) {
        await this.repository.recordProviderError(
          record.id,
          "PROVIDER_HOSTNAME_MISMATCH",
          now
        );
        throw new Error("Cloudflare provider hostname mismatch");
      }

      const ready =
        record.tenantStatus === "active" &&
        isCloudflareCustomHostnameReady(providerHostname);

      const update: CloudflareDomainSyncUpdate = {
        providerHostnameStatus: providerHostname.status,
        providerSslStatus: providerHostname.sslStatus,
        providerLastSyncedAt: now,
        providerLastErrorCode: null,
        providerLastErrorAt: null,
      };

      if (ready) {
        update.domainStatus = "active";
        update.verifiedAt = now;
      } else if (record.domainStatus !== "failed") {
        update.domainStatus = "pending_verification";
      }

      const updated = await this.repository.applySync(record.id, update);

      if (updated.domainStatus !== record.domainStatus) {
        this.clearDomainCache(record.hostname);
      }

      return {
        kind: "synced",
        hostname: updated.hostname,
        providerHostnameStatus: providerHostname.status,
        providerSslStatus: providerHostname.sslStatus,
        ready,
        domainStatus: updated.domainStatus,
      };
    } catch (error) {
      const code =
        error instanceof Error && error.name === "CloudflareSaasError"
          ? "CLOUDFLARE_PROVIDER_ERROR"
          : error instanceof Error &&
              error.message === "Cloudflare provider hostname mismatch"
            ? "PROVIDER_HOSTNAME_MISMATCH"
            : "CLOUDFLARE_SYNC_ERROR";

      if (code !== "PROVIDER_HOSTNAME_MISMATCH") {
        await this.repository.recordProviderError(record.id, code, now);
      }
      throw error;
    }
  }
}
