import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/db";
import {
  organizationMemberships,
  planPrices,
  plans,
  platformBillingAttempts,
  stores,
  subscriptions,
} from "@/drizzle/control-plane-schema";
import {
  PlatformBillingError,
  type PlatformBillingAttempt,
  type PlatformBillingRepository,
  type PlatformBillingSelection,
} from "./core";

const billableSubscriptionStatuses = [
  "pending",
  "trialing",
  "active",
  "past_due",
] as const;

function mapAttempt(
  row: typeof platformBillingAttempts.$inferSelect
): PlatformBillingAttempt {
  return {
    ...row,
    billingInterval: row.billingInterval,
  };
}

export class DrizzlePlatformBillingRepository
  implements PlatformBillingRepository
{
  async createOrReuseAttemptForOwnedStore(
    merchantId: number,
    storeId: number,
    selection: PlatformBillingSelection,
    now = new Date()
  ): Promise<PlatformBillingAttempt> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [store] = await tx
        .select({
          id: stores.id,
          organizationId: stores.organizationId,
        })
        .from(stores)
        .innerJoin(
          organizationMemberships,
          eq(organizationMemberships.organizationId, stores.organizationId)
        )
        .where(
          and(
            eq(stores.id, storeId),
            eq(organizationMemberships.merchantAccountId, merchantId),
            eq(organizationMemberships.role, "owner"),
            isNull(stores.deletedAt)
          )
        )
        .limit(1);

      if (!store) {
        throw new PlatformBillingError(
          "STORE_NOT_FOUND",
          "Owned Store not found"
        );
      }

      const [subscription] = await tx
        .select({
          id: subscriptions.id,
          organizationId: subscriptions.organizationId,
          storeId: subscriptions.storeId,
          planId: subscriptions.planId,
          status: subscriptions.status,
        })
        .from(subscriptions)
        .where(eq(subscriptions.storeId, store.id))
        .limit(1);

      if (!subscription) {
        throw new PlatformBillingError(
          "SUBSCRIPTION_NOT_FOUND",
          "Store subscription not found"
        );
      }

      if (
        subscription.organizationId !== store.organizationId ||
        subscription.storeId !== store.id
      ) {
        throw new PlatformBillingError(
          "OWNERSHIP_MISMATCH",
          "Subscription ownership does not match Store ownership"
        );
      }

      if (!billableSubscriptionStatuses.includes(subscription.status as never)) {
        throw new PlatformBillingError(
          "SUBSCRIPTION_NOT_BILLABLE",
          "Subscription is not billable"
        );
      }

      await tx.execute(
        sql`select pg_advisory_xact_lock(${subscription.id}::bigint)`
      );

      const [pricedPlan] = await tx
        .select({
          planId: plans.id,
          planCode: plans.code,
          planName: plans.name,
          amountMinor: planPrices.amountMinor,
          currency: planPrices.currency,
        })
        .from(plans)
        .innerJoin(
          planPrices,
          and(
            eq(planPrices.planId, plans.id),
            eq(planPrices.billingInterval, selection.billingInterval),
            eq(planPrices.currency, "ILS")
          )
        )
        .where(eq(plans.id, subscription.planId))
        .limit(1);

      if (!pricedPlan) {
        throw new PlatformBillingError(
          "PRICE_NOT_CONFIGURED",
          "No authoritative price is configured for this subscription"
        );
      }

      const [existing] = await tx
        .select()
        .from(platformBillingAttempts)
        .where(
          and(
            eq(platformBillingAttempts.subscriptionId, subscription.id),
            eq(platformBillingAttempts.organizationId, store.organizationId),
            eq(platformBillingAttempts.storeId, store.id),
            eq(platformBillingAttempts.planId, pricedPlan.planId),
            eq(
              platformBillingAttempts.billingInterval,
              selection.billingInterval
            ),
            eq(platformBillingAttempts.currency, pricedPlan.currency),
            eq(platformBillingAttempts.amountMinor, pricedPlan.amountMinor),
            inArray(platformBillingAttempts.status, ["created", "pending"])
          )
        )
        .orderBy(desc(platformBillingAttempts.id))
        .limit(1);

      if (existing) return mapAttempt(existing);

      const [created] = await tx
        .insert(platformBillingAttempts)
        .values({
          subscriptionId: subscription.id,
          organizationId: store.organizationId,
          storeId: store.id,
          planId: pricedPlan.planId,
          planCodeSnapshot: pricedPlan.planCode,
          planNameSnapshot: pricedPlan.planName,
          billingInterval: selection.billingInterval,
          currency: pricedPlan.currency,
          amountMinor: pricedPlan.amountMinor,
          status: "created",
          externalReference: `shopnest-${randomUUID()}`,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      if (!created) {
        throw new PlatformBillingError(
          "SUBSCRIPTION_NOT_BILLABLE",
          "Billing attempt creation failed"
        );
      }

      return mapAttempt(created);
    });
  }
}
