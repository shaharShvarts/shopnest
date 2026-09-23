import "server-only";

import {
  and,
  eq,
  gt,
  isNull,
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
  type OwnedCandidateCheckReservation,
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
}
