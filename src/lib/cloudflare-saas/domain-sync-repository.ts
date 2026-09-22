import "server-only";

import { eq } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/control-db";
import {
  controlPlaneTenants,
  storeDomains,
} from "@/drizzle/control-plane-schema";
import type {
  CloudflareDomainSyncRecord,
  CloudflareDomainSyncRepository,
  CloudflareDomainSyncUpdate,
} from "./domain-sync";

const selection = {
  id: storeDomains.id,
  hostname: storeDomains.hostname,
  domainStatus: storeDomains.status,
  provider: storeDomains.provider,
  providerHostnameId: storeDomains.providerHostnameId,
  tenantStatus: controlPlaneTenants.status,
};

export class DrizzleCloudflareDomainSyncRepository
  implements CloudflareDomainSyncRepository
{
  async findByHostname(
    hostname: string
  ): Promise<CloudflareDomainSyncRecord | null> {
    const [row] = await getControlPlaneDb()
      .select(selection)
      .from(storeDomains)
      .innerJoin(
        controlPlaneTenants,
        eq(controlPlaneTenants.id, storeDomains.tenantId)
      )
      .where(eq(storeDomains.hostname, hostname))
      .limit(1);

    return row ?? null;
  }

  async applySync(
    id: number,
    update: CloudflareDomainSyncUpdate
  ): Promise<CloudflareDomainSyncRecord> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [current] = await tx
        .select(selection)
        .from(storeDomains)
        .innerJoin(
          controlPlaneTenants,
          eq(controlPlaneTenants.id, storeDomains.tenantId)
        )
        .where(eq(storeDomains.id, id))
        .limit(1)
        .for("update");

      if (!current) {
        throw new Error("Store domain disappeared during Cloudflare sync");
      }

      const values: Partial<typeof storeDomains.$inferInsert> = {
        providerHostnameStatus: update.providerHostnameStatus,
        providerSslStatus: update.providerSslStatus,
        providerLastSyncedAt: update.providerLastSyncedAt,
        providerLastErrorCode: update.providerLastErrorCode,
        providerLastErrorAt: update.providerLastErrorAt,
        updatedAt: update.providerLastSyncedAt,
      };

      if (update.domainStatus) values.status = update.domainStatus;
      if (update.verifiedAt && !current.domainStatus.startsWith("removed")) {
        values.verifiedAt = update.verifiedAt;
      }

      const [updatedDomain] = await tx
        .update(storeDomains)
        .set(values)
        .where(eq(storeDomains.id, id))
        .returning({
          id: storeDomains.id,
          hostname: storeDomains.hostname,
          domainStatus: storeDomains.status,
          provider: storeDomains.provider,
          providerHostnameId: storeDomains.providerHostnameId,
        });

      return {
        ...updatedDomain,
        tenantStatus: current.tenantStatus,
      };
    });
  }

  async recordProviderError(
    id: number,
    errorCode: string,
    now: Date
  ): Promise<void> {
    await getControlPlaneDb()
      .update(storeDomains)
      .set({
        providerLastErrorCode: errorCode.slice(0, 128),
        providerLastErrorAt: now,
        updatedAt: now,
      })
      .where(eq(storeDomains.id, id));
  }
}
