import "server-only";

import {
  and,
  eq,
  gte,
  isNotNull,
  isNull,
  ne,
  sql,
} from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/control-db";
import {
  controlPlaneTenants,
  organizationMemberships,
  storeDomainClaims,
  storeDomains,
  stores,
} from "@/drizzle/control-plane-schema";
import {
  CloudflareDomainProvisioningError,
  type CloudflareDomainProvisioningRepository,
  type DomainProvisioningFinalizeResult,
  type DomainProvisioningReservation,
} from "./domain-provisioning";

export class DrizzleCloudflareDomainProvisioningRepository
  implements CloudflareDomainProvisioningRepository
{
  async preflightVerifiedClaim(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
  }): Promise<void> {
    const [claim] = await getControlPlaneDb()
      .select({
        claimStatus: storeDomainClaims.status,
        verifiedAt: storeDomainClaims.verifiedAt,
        tenantId: stores.tenantId,
        storeStatus: stores.status,
        tenantStatus: controlPlaneTenants.status,
      })
      .from(storeDomainClaims)
      .innerJoin(stores, eq(stores.id, storeDomainClaims.storeId))
      .innerJoin(
        organizationMemberships,
        eq(
          organizationMemberships.organizationId,
          stores.organizationId
        )
      )
      .leftJoin(
        controlPlaneTenants,
        eq(controlPlaneTenants.id, stores.tenantId)
      )
      .where(
        and(
          eq(storeDomainClaims.storeId, input.storeId),
          eq(storeDomainClaims.hostname, input.hostname),
          eq(
            organizationMemberships.merchantAccountId,
            input.merchantId
          ),
          eq(organizationMemberships.role, "owner"),
          isNull(stores.deletedAt)
        )
      )
      .limit(1);

    if (
      !claim ||
      (claim.claimStatus !== "verified" &&
        claim.claimStatus !== "consumed") ||
      !claim.verifiedAt
    ) {
      throw new CloudflareDomainProvisioningError(
        "CLAIM_NOT_VERIFIED",
        "Verified domain claim not found"
      );
    }

    if (claim.storeStatus !== "provisioned" || claim.tenantId === null) {
      throw new CloudflareDomainProvisioningError(
        "STORE_NOT_PROVISIONED",
        "Store must be provisioned before custom-domain provisioning"
      );
    }

    if (claim.tenantStatus !== "active") {
      throw new CloudflareDomainProvisioningError(
        "TENANT_NOT_ACTIVE",
        "Tenant must be active before custom-domain provisioning"
      );
    }
  }
  async reserveVerifiedClaim(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
    verificationToken: string;
    providerCount: number;
    freeHostnameLimit: number;
    needsProviderCreate: boolean;
    leaseMs: number;
    now: Date;
  }): Promise<DomainProvisioningReservation> {
    return getControlPlaneDb().transaction(async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('shopnest_cloudflare_hostname_quota'))`
      );

      const [claim] = await tx
        .select({
          claimId: storeDomainClaims.id,
          claimStatus: storeDomainClaims.status,
          verifiedAt: storeDomainClaims.verifiedAt,
          consumedAt: storeDomainClaims.consumedAt,
          hostname: storeDomainClaims.hostname,
          tenantId: stores.tenantId,
          storeStatus: stores.status,
          tenantStatus: controlPlaneTenants.status,
        })
        .from(storeDomainClaims)
        .innerJoin(stores, eq(stores.id, storeDomainClaims.storeId))
        .innerJoin(
          organizationMemberships,
          eq(
            organizationMemberships.organizationId,
            stores.organizationId
          )
        )
        .leftJoin(
          controlPlaneTenants,
          eq(controlPlaneTenants.id, stores.tenantId)
        )
        .where(
          and(
            eq(storeDomainClaims.storeId, input.storeId),
            eq(storeDomainClaims.hostname, input.hostname),
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

      if (
        !claim ||
        (claim.claimStatus !== "verified" &&
          claim.claimStatus !== "consumed") ||
        !claim.verifiedAt
      ) {
        throw new CloudflareDomainProvisioningError(
          "CLAIM_NOT_VERIFIED",
          "Verified domain claim not found"
        );
      }

      if (claim.storeStatus !== "provisioned" || claim.tenantId === null) {
        throw new CloudflareDomainProvisioningError(
          "STORE_NOT_PROVISIONED",
          "Store must be provisioned before custom-domain provisioning"
        );
      }

      if (claim.tenantStatus !== "active") {
        throw new CloudflareDomainProvisioningError(
          "TENANT_NOT_ACTIVE",
          "Tenant must be active before custom-domain provisioning"
        );
      }

      const [existing] = await tx
        .select({
          id: storeDomains.id,
          tenantId: storeDomains.tenantId,
          hostname: storeDomains.hostname,
          status: storeDomains.status,
          provider: storeDomains.provider,
          providerHostnameId: storeDomains.providerHostnameId,
          activationRequestedAt: storeDomains.activationRequestedAt,
        })
        .from(storeDomains)
        .where(eq(storeDomains.hostname, input.hostname))
        .limit(1)
        .for("update");

      if (existing) {
        if (
          existing.tenantId !== claim.tenantId ||
          existing.provider !== "cloudflare" ||
          existing.status === "removed"
        ) {
          throw new CloudflareDomainProvisioningError(
            "DOMAIN_CONFLICT",
            "Custom domain is already bound elsewhere"
          );
        }

        if (existing.providerHostnameId || claim.claimStatus === "consumed") {
          return {
            kind: "ready",
            claimId: claim.claimId,
            domainId: existing.id,
            hostname: existing.hostname,
            tenantId: claim.tenantId,
            providerHostnameId: existing.providerHostnameId,
            claimAlreadyConsumed: claim.claimStatus === "consumed",
          };
        }

        const leaseCutoff = new Date(
          input.now.getTime() - input.leaseMs
        );

        if (
          existing.activationRequestedAt &&
          existing.activationRequestedAt >= leaseCutoff
        ) {
          return {
            kind: "in_progress",
            hostname: existing.hostname,
          };
        }

        if (input.needsProviderCreate) {
          await this.assertQuotaAvailable(
            tx,
            input.providerCount,
            input.freeHostnameLimit,
            input.now,
            input.leaseMs
          );
        }

        await tx
          .update(storeDomains)
          .set({
            activationRequestedAt: input.now,
            providerLastErrorCode: null,
            providerLastErrorAt: null,
            updatedAt: input.now,
          })
          .where(eq(storeDomains.id, existing.id));

        return {
          kind: "ready",
          claimId: claim.claimId,
          domainId: existing.id,
          hostname: existing.hostname,
          tenantId: claim.tenantId,
          providerHostnameId: null,
          claimAlreadyConsumed: false,
        };
      }

      if (claim.claimStatus === "consumed") {
        throw new CloudflareDomainProvisioningError(
          "DOMAIN_CONFLICT",
          "Consumed claim is missing its custom-domain binding"
        );
      }

      if (input.needsProviderCreate) {
        await this.assertQuotaAvailable(
          tx,
          input.providerCount,
          input.freeHostnameLimit,
          input.now,
          input.leaseMs
        );
      }

      const [created] = await tx
        .insert(storeDomains)
        .values({
          tenantId: claim.tenantId,
          hostname: input.hostname,
          type: "custom",
          status: "pending_verification",
          verificationToken: input.verificationToken,
          verifiedAt: claim.verifiedAt,
          isPrimary: false,
          provider: "cloudflare",
          activationRequestedAt: input.now,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning({
          id: storeDomains.id,
          hostname: storeDomains.hostname,
        });

      return {
        kind: "ready",
        claimId: claim.claimId,
        domainId: created.id,
        hostname: created.hostname,
        tenantId: claim.tenantId,
        providerHostnameId: null,
        claimAlreadyConsumed: false,
      };
    });
  }

  async finalizeProvisioning(input: {
    claimId: number;
    domainId: number;
    hostname: string;
    tenantId: number;
    providerHostname: {
      id: string;
      hostname: string;
      status: string;
      sslStatus: string | null;
    };
    now: Date;
  }): Promise<DomainProvisioningFinalizeResult> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [claim] = await tx
        .select({
          id: storeDomainClaims.id,
          status: storeDomainClaims.status,
          hostname: storeDomainClaims.hostname,
          verifiedAt: storeDomainClaims.verifiedAt,
          consumedAt: storeDomainClaims.consumedAt,
        })
        .from(storeDomainClaims)
        .where(eq(storeDomainClaims.id, input.claimId))
        .limit(1)
        .for("update");

      const [domain] = await tx
        .select({
          id: storeDomains.id,
          tenantId: storeDomains.tenantId,
          hostname: storeDomains.hostname,
          provider: storeDomains.provider,
          providerHostnameId: storeDomains.providerHostnameId,
          status: storeDomains.status,
        })
        .from(storeDomains)
        .where(eq(storeDomains.id, input.domainId))
        .limit(1)
        .for("update");

      if (
        !claim ||
        !claim.verifiedAt ||
        (claim.status !== "verified" && claim.status !== "consumed")
      ) {
        throw new CloudflareDomainProvisioningError(
          "CLAIM_NOT_VERIFIED",
          "Verified domain claim disappeared during provisioning"
        );
      }

      if (
        !domain ||
        domain.tenantId !== input.tenantId ||
        domain.hostname !== input.hostname ||
        domain.provider !== "cloudflare" ||
        domain.status === "removed"
      ) {
        throw new CloudflareDomainProvisioningError(
          "DOMAIN_CONFLICT",
          "Custom-domain binding changed during provisioning"
        );
      }

      if (
        input.providerHostname.hostname !== input.hostname ||
        (domain.providerHostnameId &&
          domain.providerHostnameId !== input.providerHostname.id)
      ) {
        throw new CloudflareDomainProvisioningError(
          "PROVIDER_HOSTNAME_MISMATCH",
          "Cloudflare hostname changed during provisioning"
        );
      }

      await tx
        .update(storeDomains)
        .set({
          providerHostnameId: input.providerHostname.id,
          providerHostnameStatus: input.providerHostname.status,
          providerSslStatus: input.providerHostname.sslStatus,
          providerLastSyncedAt: input.now,
          providerLastErrorCode: null,
          providerLastErrorAt: null,
          updatedAt: input.now,
        })
        .where(eq(storeDomains.id, input.domainId));

      const consumedAt = claim.consumedAt ?? input.now;

      if (claim.status !== "consumed") {
        await tx
          .update(storeDomainClaims)
          .set({
            status: "consumed",
            consumedAt,
            updatedAt: input.now,
          })
          .where(eq(storeDomainClaims.id, input.claimId));
      }

      return {
        claimId: claim.id,
        domainId: domain.id,
        hostname: domain.hostname,
        tenantId: domain.tenantId,
        providerHostnameId: input.providerHostname.id,
        claimConsumedAt: consumedAt,
      };
    });
  }

  async recordProvisioningError(input: {
    domainId: number;
    errorCode: string;
    now: Date;
  }): Promise<void> {
    await getControlPlaneDb()
      .update(storeDomains)
      .set({
        providerLastErrorCode: input.errorCode.slice(0, 128),
        providerLastErrorAt: input.now,
        updatedAt: input.now,
      })
      .where(eq(storeDomains.id, input.domainId));
  }

  private async assertQuotaAvailable(
    tx: Parameters<
      Parameters<ReturnType<typeof getControlPlaneDb>["transaction"]>[0]
    >[0],
    providerCount: number,
    freeHostnameLimit: number,
    now: Date,
    leaseMs: number
  ) {
    const leaseCutoff = new Date(now.getTime() - leaseMs);

    const [pending] = await tx
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(storeDomains)
      .where(
        and(
          eq(storeDomains.provider, "cloudflare"),
          isNull(storeDomains.providerHostnameId),
          ne(storeDomains.status, "removed"),
          isNotNull(storeDomains.activationRequestedAt),
          gte(storeDomains.activationRequestedAt, leaseCutoff)
        )
      );

    const pendingCount = pending?.count ?? 0;

    if (providerCount + pendingCount >= freeHostnameLimit) {
      throw new CloudflareDomainProvisioningError(
        "PROVIDER_QUOTA_EXHAUSTED",
        "Cloudflare Free custom-hostname allowance is exhausted"
      );
    }
  }
}
