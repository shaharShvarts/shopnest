import "server-only";

import { and, eq, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/control-db";
import {
  organizationMemberships,
  storeDomains,
  stores,
} from "@/drizzle/control-plane-schema";
import {
  CloudflareDomainRemovalError,
  type CloudflareDomainRemovalRepository,
  type DomainRemovalReservation,
} from "./domain-removal";

export class DrizzleCloudflareDomainRemovalRepository
  implements CloudflareDomainRemovalRepository
{
  async prepareRemoval(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
    now: Date;
  }): Promise<DomainRemovalReservation> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [ownedStore] = await tx
        .select({
          tenantId: stores.tenantId,
        })
        .from(stores)
        .innerJoin(
          organizationMemberships,
          eq(
            organizationMemberships.organizationId,
            stores.organizationId
          )
        )
        .where(
          and(
            eq(stores.id, input.storeId),
            eq(
              organizationMemberships.merchantAccountId,
              input.merchantId
            ),
            eq(organizationMemberships.role, "owner"),
            isNull(stores.deletedAt)
          )
        )
        .limit(1)
        .for("update");

      if (!ownedStore?.tenantId) {
        throw new CloudflareDomainRemovalError(
          "DOMAIN_NOT_FOUND",
          "Owned custom domain not found"
        );
      }

      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('shopnest_domain_lifecycle'), ${ownedStore.tenantId})`
      );

      let [row] = await tx
        .select({
          domainId: storeDomains.id,
          hostname: storeDomains.hostname,
          domainStatus: storeDomains.status,
          provider: storeDomains.provider,
          providerHostnameId: storeDomains.providerHostnameId,
        })
        .from(storeDomains)
        .where(
          and(
            eq(storeDomains.tenantId, ownedStore.tenantId),
            eq(storeDomains.hostname, input.hostname),
            eq(storeDomains.lifecycleRole, "primary"),
            eq(storeDomains.status, "active")
          )
        )
        .limit(1)
        .for("update");

      if (!row) {
        const [stillBound] = await tx
          .select({ id: storeDomains.id })
          .from(storeDomains)
          .where(
            and(
              eq(storeDomains.tenantId, ownedStore.tenantId),
              eq(storeDomains.hostname, input.hostname),
              ne(storeDomains.status, "removed")
            )
          )
          .limit(1)
          .for("update");

        if (stillBound) {
          throw new CloudflareDomainRemovalError(
            "DOMAIN_CONFLICT",
            "Custom domain is no longer the current primary"
          );
        }

        const [removed] = await tx
          .select({
            domainId: storeDomains.id,
            hostname: storeDomains.hostname,
            domainStatus: storeDomains.status,
            provider: storeDomains.provider,
            providerHostnameId: storeDomains.providerHostnameId,
          })
          .from(storeDomains)
          .where(
            and(
              eq(storeDomains.tenantId, ownedStore.tenantId),
              eq(storeDomains.hostname, input.hostname),
              eq(storeDomains.status, "removed"),
              isNotNull(storeDomains.providerHostnameId)
            )
          )
          .limit(1)
          .for("update");

        if (!removed) {
          return {
            kind: "already_removed",
            hostname: input.hostname,
          };
        }

        row = removed;
      }

      if (
        row.providerHostnameId &&
        row.provider !== "cloudflare"
      ) {
        throw new CloudflareDomainRemovalError(
          "DOMAIN_CONFLICT",
          "Custom domain provider binding is not Cloudflare"
        );
      }

      if (
        row.domainStatus === "removed" &&
        !row.providerHostnameId
      ) {
        return {
          kind: "already_removed",
          hostname: row.hostname,
        };
      }

      await tx
        .update(storeDomains)
        .set({
          status: "removed",
          lifecycleRole: null,
          isPrimary: false,
          retireAt: null,
          redirectToDomainId: null,
          providerLastErrorCode: null,
          providerLastErrorAt: null,
          updatedAt: input.now,
        })
        .where(eq(storeDomains.id, row.domainId));

      return {
        kind: "ready",
        domainId: row.domainId,
        hostname: row.hostname,
        providerHostnameId: row.providerHostnameId,
      };
    });
  }

  async finalizeRemoval(input: {
    domainId: number;
    now: Date;
  }): Promise<void> {
    await getControlPlaneDb()
      .update(storeDomains)
      .set({
        status: "removed",
        providerHostnameId: null,
        providerHostnameStatus: null,
        providerSslStatus: null,
        providerLastSyncedAt: input.now,
        providerLastErrorCode: null,
        providerLastErrorAt: null,
        activationRequestedAt: null,
        updatedAt: input.now,
      })
      .where(eq(storeDomains.id, input.domainId));
  }

  async recordRemovalError(input: {
    domainId: number;
    errorCode: string;
    now: Date;
  }): Promise<void> {
    await getControlPlaneDb()
      .update(storeDomains)
      .set({
        status: "removed",
        providerLastErrorCode: input.errorCode.slice(0, 128),
        providerLastErrorAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(storeDomains.id, input.domainId));
  }
}
