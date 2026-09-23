import "server-only";

import { and, eq, isNull } from "drizzle-orm";
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
      const [row] = await tx
        .select({
          domainId: storeDomains.id,
          hostname: storeDomains.hostname,
          domainStatus: storeDomains.status,
          provider: storeDomains.provider,
          providerHostnameId: storeDomains.providerHostnameId,
        })
        .from(storeDomains)
        .innerJoin(
          stores,
          and(
            eq(stores.id, input.storeId),
            eq(stores.tenantId, storeDomains.tenantId)
          )
        )
        .innerJoin(
          organizationMemberships,
          eq(
            organizationMemberships.organizationId,
            stores.organizationId
          )
        )
        .where(
          and(
            eq(storeDomains.hostname, input.hostname),
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

      if (!row) {
        throw new CloudflareDomainRemovalError(
          "DOMAIN_NOT_FOUND",
          "Owned custom domain not found"
        );
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
