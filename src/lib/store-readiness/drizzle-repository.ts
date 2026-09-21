import { and, asc, eq, isNull } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/db";
import {
  organizationMemberships,
  organizations,
  plans,
  storePolicyDocuments,
  stores,
  subscriptions,
} from "@/drizzle/control-plane-schema";
import {
  isStorePolicyType,
  requiredPolicyTypesForMarket,
  type StorePolicyType,
} from "@/lib/merchant-policies/core";
import {
  buildStoreReadinessResult,
  evaluatePolicies,
  evaluateStoreProfile,
  evaluateSubscription,
  unavailableRequirement,
  type StoreReadinessResult,
} from "./core";

export interface StoreReadinessRepository {
  evaluateForOwnedStore(
    merchantId: number,
    storeId: number,
    now?: Date
  ): Promise<StoreReadinessResult | null>;
}

export class DrizzleStoreReadinessRepository
  implements StoreReadinessRepository
{
  async evaluateForOwnedStore(
    merchantId: number,
    storeId: number,
    now = new Date()
  ): Promise<StoreReadinessResult | null> {
    const db = getControlPlaneDb();

    const [context] = await db
      .select({
        storeId: stores.id,
        storeOrganizationId: stores.organizationId,
        storeDisplayName: stores.displayName,
        storeSlug: stores.slug,
        storeTenantId: stores.tenantId,
        organizationDisplayName: organizations.displayName,
        legalName: organizations.legalName,
        businessNumber: organizations.businessNumber,
        vatNumber: organizations.vatNumber,
        email: organizations.email,
        phone: organizations.phone,
        country: organizations.country,
      })
      .from(stores)
      .innerJoin(organizations, eq(organizations.id, stores.organizationId))
      .innerJoin(
        organizationMemberships,
        and(
          eq(organizationMemberships.organizationId, stores.organizationId),
          eq(organizationMemberships.merchantAccountId, merchantId),
          eq(organizationMemberships.role, "owner")
        )
      )
      .where(and(eq(stores.id, storeId), isNull(stores.deletedAt)))
      .orderBy(
        asc(organizationMemberships.createdAt),
        asc(organizationMemberships.organizationId)
      )
      .limit(1);

    if (!context) return null;

    const [subscriptionRow] = await db
      .select({
        storeId: subscriptions.storeId,
        organizationId: subscriptions.organizationId,
        tenantId: subscriptions.tenantId,
        status: subscriptions.status,
        planStatus: plans.status,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(
        and(
          eq(subscriptions.storeId, storeId),
          eq(
            subscriptions.organizationId,
            context.storeOrganizationId
          )
        )
      )
      .limit(1);

    const publishedPolicyRows = await db
      .select({ policyType: storePolicyDocuments.policyType })
      .from(storePolicyDocuments)
      .where(
        and(
          eq(storePolicyDocuments.storeId, storeId),
          eq(
            storePolicyDocuments.organizationId,
            context.storeOrganizationId
          ),
          eq(storePolicyDocuments.market, context.country),
          eq(storePolicyDocuments.status, "published")
        )
      );

    const publishedPolicyTypes = new Set<StorePolicyType>();
    for (const row of publishedPolicyRows) {
      if (isStorePolicyType(row.policyType)) {
        publishedPolicyTypes.add(row.policyType);
      }
    }

    const requirements = [
      evaluateStoreProfile({
        storeDisplayName: context.storeDisplayName,
        storeSlug: context.storeSlug,
        organizationDisplayName: context.organizationDisplayName,
        legalName: context.legalName,
        businessNumber: context.businessNumber,
        vatNumber: context.vatNumber,
        email: context.email,
        phone: context.phone,
        country: context.country,
      }),
      unavailableRequirement("shipping"),
      unavailableRequirement("payments"),
      unavailableRequirement("invoicing"),
      evaluatePolicies(
        requiredPolicyTypesForMarket(context.country),
        publishedPolicyTypes
      ),
      unavailableRequirement("products"),
      evaluateSubscription({
        storeId,
        organizationId: context.storeOrganizationId,
        subscription: subscriptionRow ?? null,
      }),
    ];

    return buildStoreReadinessResult(storeId, requirements, now);
  }
}
