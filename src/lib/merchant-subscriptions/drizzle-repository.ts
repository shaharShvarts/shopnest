import { and, asc, eq, isNull } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/db";
import {
  organizationMemberships,
  plans,
  stores,
  subscriptions,
} from "@/drizzle/control-plane-schema";
import {
  MerchantSubscriptionError,
  type MerchantPlan,
  type MerchantStoreSubscription,
  type MerchantSubscriptionRepository,
  type PlanSelection,
} from "./core";

const planSelection = {
  id: plans.id,
  code: plans.code,
  name: plans.name,
  status: plans.status,
};

const subscriptionSelection = {
  id: subscriptions.id,
  organizationId: subscriptions.organizationId,
  storeId: subscriptions.storeId,
  tenantId: subscriptions.tenantId,
  planId: subscriptions.planId,
  status: subscriptions.status,
  trialEndsAt: subscriptions.trialEndsAt,
  currentPeriodStart: subscriptions.currentPeriodStart,
  currentPeriodEnd: subscriptions.currentPeriodEnd,
  cancelAt: subscriptions.cancelAt,
  createdAt: subscriptions.createdAt,
  updatedAt: subscriptions.updatedAt,
};

function mapPlan(row: typeof plans.$inferSelect): MerchantPlan {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    status: row.status,
  };
}

function mapSubscription(
  row: typeof subscriptions.$inferSelect,
  plan: MerchantPlan
): MerchantStoreSubscription {
  return {
    id: row.id,
    organizationId: row.organizationId,
    storeId: row.storeId,
    tenantId: row.tenantId,
    planId: row.planId,
    status: row.status,
    trialEndsAt: row.trialEndsAt,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAt: row.cancelAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    plan,
  };
}

async function ownerOrganizationId(
  db: ReturnType<typeof getControlPlaneDb>,
  merchantId: number
) {
  const [membership] = await db
    .select({ organizationId: organizationMemberships.organizationId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.merchantAccountId, merchantId),
        eq(organizationMemberships.role, "owner")
      )
    )
    .orderBy(
      asc(organizationMemberships.createdAt),
      asc(organizationMemberships.organizationId)
    )
    .limit(1);

  return membership?.organizationId ?? null;
}

export class DrizzleMerchantSubscriptionRepository
  implements MerchantSubscriptionRepository
{
  async listActivePlans(): Promise<MerchantPlan[]> {
    const rows = await getControlPlaneDb()
      .select(planSelection)
      .from(plans)
      .where(eq(plans.status, "active"))
      .orderBy(asc(plans.id));

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      status: row.status,
    }));
  }

  async findForOwnedStore(
    merchantId: number,
    storeId: number
  ): Promise<MerchantStoreSubscription | null> {
    const db = getControlPlaneDb();
    const organizationId = await ownerOrganizationId(db, merchantId);
    if (organizationId === null) return null;

    const [store] = await db
      .select({ id: stores.id })
      .from(stores)
      .where(
        and(
          eq(stores.id, storeId),
          eq(stores.organizationId, organizationId),
          isNull(stores.deletedAt)
        )
      )
      .limit(1);

    if (!store) return null;

    const [row] = await db
      .select({
        subscription: subscriptionSelection,
        plan: planSelection,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(
        and(
          eq(subscriptions.storeId, storeId),
          eq(subscriptions.organizationId, organizationId)
        )
      )
      .limit(1);

    if (!row) return null;

    return mapSubscription(
      row.subscription as typeof subscriptions.$inferSelect,
      row.plan as MerchantPlan
    );
  }

  async selectPlanForOwnedStore(
    merchantId: number,
    storeId: number,
    selection: PlanSelection,
    now = new Date()
  ): Promise<MerchantStoreSubscription> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [membership] = await tx
        .select({ organizationId: organizationMemberships.organizationId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.merchantAccountId, merchantId),
            eq(organizationMemberships.role, "owner")
          )
        )
        .orderBy(
          asc(organizationMemberships.createdAt),
          asc(organizationMemberships.organizationId)
        )
        .limit(1);

      const organizationId = membership?.organizationId ?? null;
      if (organizationId === null) {
        throw new MerchantSubscriptionError(
          "STORE_NOT_FOUND",
          "Owned Store not found"
        );
      }

      const [store] = await tx
        .select({
          id: stores.id,
          organizationId: stores.organizationId,
          tenantId: stores.tenantId,
        })
        .from(stores)
        .where(
          and(
            eq(stores.id, storeId),
            eq(stores.organizationId, organizationId),
            isNull(stores.deletedAt)
          )
        )
        .limit(1);

      if (!store) {
        throw new MerchantSubscriptionError(
          "STORE_NOT_FOUND",
          "Owned Store not found"
        );
      }

      if (store.tenantId !== null) {
        throw new MerchantSubscriptionError(
          "STORE_PROVISIONED",
          "Provisioned Store plan changes are not handled by onboarding"
        );
      }

      const [planRow] = await tx
        .select(planSelection)
        .from(plans)
        .where(
          and(
            eq(plans.code, selection.planCode),
            eq(plans.status, "active")
          )
        )
        .limit(1);

      if (!planRow) {
        throw new MerchantSubscriptionError(
          "PLAN_UNAVAILABLE",
          "Selected plan is unavailable"
        );
      }

      const [existing] = await tx
        .select(subscriptionSelection)
        .from(subscriptions)
        .where(eq(subscriptions.storeId, storeId))
        .limit(1);

      let subscription: typeof subscriptions.$inferSelect;

      if (existing) {
        if (existing.organizationId !== organizationId) {
          throw new MerchantSubscriptionError(
            "OWNERSHIP_MISMATCH",
            "Subscription ownership does not match Store ownership"
          );
        }

        if (existing.tenantId !== null || existing.status !== "pending") {
          throw new MerchantSubscriptionError(
            "SUBSCRIPTION_LOCKED",
            "Only pending pre-provisioning subscriptions can change plan here"
          );
        }

        const [updated] = await tx
          .update(subscriptions)
          .set({
            planId: planRow.id,
            updatedAt: now,
          })
          .where(
            and(
              eq(subscriptions.id, existing.id),
              eq(subscriptions.organizationId, organizationId),
              eq(subscriptions.storeId, storeId)
            )
          )
          .returning();

        if (!updated) {
          throw new MerchantSubscriptionError(
            "STORE_NOT_FOUND",
            "Subscription update failed"
          );
        }
        subscription = updated;
      } else {
        const [created] = await tx
          .insert(subscriptions)
          .values({
            organizationId,
            storeId,
            tenantId: null,
            planId: planRow.id,
            status: "pending",
            createdAt: now,
            updatedAt: now,
          })
          .returning();

        if (!created) {
          throw new MerchantSubscriptionError(
            "STORE_NOT_FOUND",
            "Subscription creation failed"
          );
        }
        subscription = created;
      }

      return mapSubscription(subscription, {
        id: planRow.id,
        code: planRow.code,
        name: planRow.name,
        status: planRow.status,
      });
    });
  }
}
