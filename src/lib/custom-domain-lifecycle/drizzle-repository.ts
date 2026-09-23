import "server-only";

import {
  and,
  eq,
  gt,
  isNotNull,
  isNull,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/control-db";
import {
  controlPlaneTenants,
  organizationMemberships,
  plans,
  storeDomains,
  stores,
  subscriptions,
} from "@/drizzle/control-plane-schema";
import {
  CustomDomainLifecycleError,
  type CustomDomainLifecycleRepository,
  type DomainCutoverResult,
  type DomainRollbackResult,
  type OwnedCandidateCheckReservation,
  type RetirementCleanupReservation,
} from "./core";

function eligibleOwnerWhere(merchantId: number, storeId: number) {
  return and(
    eq(stores.id, storeId),
    isNull(stores.deletedAt),
    eq(stores.status, "provisioned"),
    eq(
      organizationMemberships.organizationId,
      stores.organizationId
    ),
    eq(
      organizationMemberships.merchantAccountId,
      merchantId
    ),
    eq(organizationMemberships.role, "owner")
  );
}

function assertEligibility(row: {
  tenantId: number | null;
  tenantStatus: "active" | "suspended" | "disabled";
  planCode: string;
  planStatus: "active" | "inactive";
  subscriptionStatus: string;
}) {
  if (
    row.tenantId === null ||
    row.tenantStatus !== "active" ||
    row.planStatus !== "active" ||
    (row.planCode !== "medium" && row.planCode !== "large") ||
    !["pending", "trialing", "active"].includes(row.subscriptionStatus)
  ) {
    throw new CustomDomainLifecycleError(
      "ELIGIBILITY_CHANGED",
      "Store eligibility changed during custom-domain lifecycle"
    );
  }
}

export class DrizzleCustomDomainLifecycleRepository
  implements CustomDomainLifecycleRepository
{
  async reserveOwnedCandidateCheck(input: {
    merchantId: number;
    storeId: number;
    now: Date;
    cooldownMs: number;
  }): Promise<OwnedCandidateCheckReservation> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [row] = await tx
        .select({
          candidateId: storeDomains.id,
          hostname: storeDomains.hostname,
          tenantId: stores.tenantId,
          tenantStatus: controlPlaneTenants.status,
          planCode: plans.code,
          planStatus: plans.status,
          subscriptionStatus: subscriptions.status,
          lastManualCheckAt: storeDomains.lastManualCheckAt,
        })
        .from(stores)
        .innerJoin(
          organizationMemberships,
          eq(
            organizationMemberships.organizationId,
            stores.organizationId
          )
        )
        .innerJoin(
          subscriptions,
          and(
            eq(subscriptions.storeId, stores.id),
            eq(subscriptions.organizationId, stores.organizationId)
          )
        )
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .innerJoin(
          controlPlaneTenants,
          eq(controlPlaneTenants.id, stores.tenantId)
        )
        .innerJoin(
          storeDomains,
          eq(storeDomains.tenantId, stores.tenantId)
        )
        .where(
          and(
            eligibleOwnerWhere(input.merchantId, input.storeId),
            eq(storeDomains.lifecycleRole, "candidate"),
            ne(storeDomains.status, "removed")
          )
        )
        .limit(1)
        .for("update");

      if (!row) return { kind: "not_found" };
      assertEligibility(row);

      const nextAllowedAt = row.lastManualCheckAt
        ? new Date(row.lastManualCheckAt.getTime() + input.cooldownMs)
        : null;

      if (
        nextAllowedAt &&
        nextAllowedAt.getTime() > input.now.getTime()
      ) {
        return {
          kind: "cooldown",
          hostname: row.hostname,
          nextAllowedAt,
        };
      }

      await tx
        .update(storeDomains)
        .set({
          lastManualCheckAt: input.now,
          updatedAt: input.now,
        })
        .where(eq(storeDomains.id, row.candidateId));

      return {
        kind: "ready",
        candidateId: row.candidateId,
        hostname: row.hostname,
        tenantId: row.tenantId!,
      };
    });
  }

  async activateReadyCandidate(input: {
    merchantId: number;
    storeId: number;
    candidateId: number;
    now: Date;
    retirementMs: number;
  }): Promise<DomainCutoverResult> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [store] = await tx
        .select({
          tenantId: stores.tenantId,
          tenantStatus: controlPlaneTenants.status,
          planCode: plans.code,
          planStatus: plans.status,
          subscriptionStatus: subscriptions.status,
        })
        .from(stores)
        .innerJoin(
          organizationMemberships,
          eq(
            organizationMemberships.organizationId,
            stores.organizationId
          )
        )
        .innerJoin(
          subscriptions,
          and(
            eq(subscriptions.storeId, stores.id),
            eq(subscriptions.organizationId, stores.organizationId)
          )
        )
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .innerJoin(
          controlPlaneTenants,
          eq(controlPlaneTenants.id, stores.tenantId)
        )
        .where(eligibleOwnerWhere(input.merchantId, input.storeId))
        .limit(1)
        .for("update");

      if (!store || store.tenantId === null) {
        throw new CustomDomainLifecycleError(
          "ELIGIBILITY_CHANGED",
          "Owned provisioned Store disappeared during cutover"
        );
      }

      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('shopnest_domain_lifecycle'), ${store.tenantId})`
      );

      assertEligibility(store);

      const [candidate] = await tx
        .select({
          id: storeDomains.id,
          hostname: storeDomains.hostname,
          status: storeDomains.status,
          lifecycleRole: storeDomains.lifecycleRole,
          provider: storeDomains.provider,
          providerHostnameId: storeDomains.providerHostnameId,
          providerHostnameStatus: storeDomains.providerHostnameStatus,
          providerSslStatus: storeDomains.providerSslStatus,
        })
        .from(storeDomains)
        .where(
          and(
            eq(storeDomains.id, input.candidateId),
            eq(storeDomains.tenantId, store.tenantId),
            ne(storeDomains.status, "removed")
          )
        )
        .limit(1)
        .for("update");

      if (
        !candidate ||
        candidate.lifecycleRole !== "candidate" ||
        candidate.status !== "active" ||
        candidate.provider !== "cloudflare" ||
        !candidate.providerHostnameId ||
        candidate.providerHostnameStatus !== "active" ||
        candidate.providerSslStatus !== "active"
      ) {
        throw new CustomDomainLifecycleError(
          "CANDIDATE_CONFLICT",
          "Candidate is not ready for atomic cutover"
        );
      }

      const [activeRetirement] = await tx
        .select({ id: storeDomains.id })
        .from(storeDomains)
        .where(
          and(
            eq(storeDomains.tenantId, store.tenantId),
            eq(storeDomains.lifecycleRole, "retiring"),
            ne(storeDomains.status, "removed"),
            gt(storeDomains.retireAt, input.now)
          )
        )
        .limit(1)
        .for("update");

      if (activeRetirement) {
        throw new CustomDomainLifecycleError(
          "LIFECYCLE_BUSY",
          "A previous domain replacement is still in its retirement window"
        );
      }

      const [primary] = await tx
        .select({
          id: storeDomains.id,
          hostname: storeDomains.hostname,
        })
        .from(storeDomains)
        .where(
          and(
            eq(storeDomains.tenantId, store.tenantId),
            eq(storeDomains.lifecycleRole, "primary"),
            ne(storeDomains.status, "removed")
          )
        )
        .limit(1)
        .for("update");

      if (primary) {
        await tx
          .update(storeDomains)
          .set({
            lifecycleRole: "retiring",
            isPrimary: false,
            retireAt: new Date(input.now.getTime() + input.retirementMs),
            redirectToDomainId: candidate.id,
            updatedAt: input.now,
          })
          .where(eq(storeDomains.id, primary.id));
      }

      await tx
        .update(storeDomains)
        .set({
          lifecycleRole: "primary",
          isPrimary: true,
          retireAt: null,
          redirectToDomainId: null,
          updatedAt: input.now,
        })
        .where(eq(storeDomains.id, candidate.id));

      return {
        hostname: candidate.hostname,
        replacedHostname: primary?.hostname ?? null,
      };
    });
  }

  async reserveExpiredRetiringForOwnedStore(input: {
    merchantId: number;
    storeId: number;
    now: Date;
  }): Promise<RetirementCleanupReservation> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [owned] = await tx
        .select({ tenantId: stores.tenantId })
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
            isNull(stores.deletedAt),
            eq(
              organizationMemberships.merchantAccountId,
              input.merchantId
            ),
            eq(organizationMemberships.role, "owner")
          )
        )
        .limit(1)
        .for("update");

      if (!owned?.tenantId) return { kind: "none" };

      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('shopnest_domain_lifecycle'), ${owned.tenantId})`
      );

      return this.reserveExpiredRetirementForTenant(
        tx,
        owned.tenantId,
        input.now
      );
    });
  }

  async reserveExpiredRetiringForTenantSlug(input: {
    tenantSlug: string;
    now: Date;
  }): Promise<RetirementCleanupReservation> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [tenant] = await tx
        .select({ tenantId: controlPlaneTenants.id })
        .from(controlPlaneTenants)
        .where(eq(controlPlaneTenants.slug, input.tenantSlug))
        .limit(1)
        .for("update");

      if (!tenant) return { kind: "none" };

      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('shopnest_domain_lifecycle'), ${tenant.tenantId})`
      );

      return this.reserveExpiredRetirementForTenant(
        tx,
        tenant.tenantId,
        input.now
      );
    });
  }

  async rollbackRetiringDomain(input: {
    tenantSlug: string;
    restoreHostname: string;
    now: Date;
    retirementMs: number;
  }): Promise<DomainRollbackResult> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [tenant] = await tx
        .select({
          tenantId: controlPlaneTenants.id,
          tenantStatus: controlPlaneTenants.status,
        })
        .from(controlPlaneTenants)
        .where(eq(controlPlaneTenants.slug, input.tenantSlug))
        .limit(1)
        .for("update");

      if (!tenant || tenant.tenantStatus !== "active") {
        throw new CustomDomainLifecycleError(
          "ROLLBACK_NOT_AVAILABLE",
          "Rollback Tenant is not active"
        );
      }

      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('shopnest_domain_lifecycle'), ${tenant.tenantId})`
      );

      const [restoring] = await tx
        .select({
          id: storeDomains.id,
          hostname: storeDomains.hostname,
          retireAt: storeDomains.retireAt,
          redirectToDomainId: storeDomains.redirectToDomainId,
          providerHostnameStatus: storeDomains.providerHostnameStatus,
          providerSslStatus: storeDomains.providerSslStatus,
        })
        .from(storeDomains)
        .where(
          and(
            eq(storeDomains.tenantId, tenant.tenantId),
            eq(storeDomains.hostname, input.restoreHostname),
            eq(storeDomains.lifecycleRole, "retiring"),
            eq(storeDomains.status, "active"),
            gt(storeDomains.retireAt, input.now)
          )
        )
        .limit(1)
        .for("update");

      if (
        !restoring ||
        restoring.providerHostnameStatus !== "active" ||
        restoring.providerSslStatus !== "active"
      ) {
        throw new CustomDomainLifecycleError(
          "ROLLBACK_NOT_AVAILABLE",
          "Retiring domain is no longer eligible for rollback"
        );
      }

      const [primary] = await tx
        .select({
          id: storeDomains.id,
          hostname: storeDomains.hostname,
          providerHostnameStatus: storeDomains.providerHostnameStatus,
          providerSslStatus: storeDomains.providerSslStatus,
        })
        .from(storeDomains)
        .where(
          and(
            eq(storeDomains.tenantId, tenant.tenantId),
            eq(storeDomains.lifecycleRole, "primary"),
            eq(storeDomains.status, "active")
          )
        )
        .limit(1)
        .for("update");

      if (
        !primary ||
        restoring.redirectToDomainId !== primary.id
      ) {
        throw new CustomDomainLifecycleError(
          "ROLLBACK_NOT_AVAILABLE",
          "Retiring domain does not point to the current primary"
        );
      }

      await tx
        .update(storeDomains)
        .set({
          lifecycleRole: "retiring",
          isPrimary: false,
          retireAt: new Date(input.now.getTime() + input.retirementMs),
          redirectToDomainId: restoring.id,
          providerLastErrorCode: null,
          providerLastErrorAt: null,
          updatedAt: input.now,
        })
        .where(eq(storeDomains.id, primary.id));

      await tx
        .update(storeDomains)
        .set({
          lifecycleRole: "primary",
          isPrimary: true,
          retireAt: null,
          redirectToDomainId: null,
          providerLastErrorCode: null,
          providerLastErrorAt: null,
          updatedAt: input.now,
        })
        .where(eq(storeDomains.id, restoring.id));

      return {
        restoredHostname: restoring.hostname,
        retiringHostname: primary.hostname,
      };
    });
  }

  private async reserveExpiredRetirementForTenant(
    tx: Parameters<
      Parameters<ReturnType<typeof getControlPlaneDb>["transaction"]>[0]
    >[0],
    tenantId: number,
    now: Date
  ): Promise<RetirementCleanupReservation> {
    let [row] = await tx
      .select({
        domainId: storeDomains.id,
        hostname: storeDomains.hostname,
        providerHostnameId: storeDomains.providerHostnameId,
        status: storeDomains.status,
      })
      .from(storeDomains)
      .where(
        and(
          eq(storeDomains.tenantId, tenantId),
          eq(storeDomains.lifecycleRole, "retiring"),
          ne(storeDomains.status, "removed"),
          lte(storeDomains.retireAt, now)
        )
      )
      .limit(1)
      .for("update");

    if (!row) {
      [row] = await tx
        .select({
          domainId: storeDomains.id,
          hostname: storeDomains.hostname,
          providerHostnameId: storeDomains.providerHostnameId,
          status: storeDomains.status,
        })
        .from(storeDomains)
        .where(
          and(
            eq(storeDomains.tenantId, tenantId),
            eq(storeDomains.status, "removed"),
            isNotNull(storeDomains.providerHostnameId)
          )
        )
        .limit(1)
        .for("update");
    }

    if (!row) return { kind: "none" };

    if (row.status !== "removed") {
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
          updatedAt: now,
        })
        .where(eq(storeDomains.id, row.domainId));
    }

    return {
      kind: "ready",
      domainId: row.domainId,
      hostname: row.hostname,
      providerHostnameId: row.providerHostnameId,
    };
  }

}
