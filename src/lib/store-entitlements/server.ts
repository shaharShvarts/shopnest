import "server-only";

import { eq } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/db";
import {
  entitlements,
  planEntitlements,
  plans,
  stores,
  subscriptions,
} from "@/drizzle/control-plane-schema";
import {
  effectiveStoreEntitlementsFromRows,
  type EffectiveStoreEntitlements,
  type StoreEntitlementRow,
} from "./core";

export async function getEffectiveStoreEntitlements(
  storeId: number
): Promise<EffectiveStoreEntitlements> {
  if (!Number.isSafeInteger(storeId) || storeId <= 0) {
    throw new Error("Invalid Store id");
  }

  const rows = await getControlPlaneDb()
    .select({
      storeId: stores.id,
      planId: plans.id,
      planCode: plans.code,
      planName: plans.name,
      entitlementCode: entitlements.code,
      entitlementName: entitlements.name,
      entitlementDescription: entitlements.description,
      entitlementValueType: entitlements.valueType,
      entitlementValue: planEntitlements.value,
    })
    .from(stores)
    .leftJoin(subscriptions, eq(subscriptions.storeId, stores.id))
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .leftJoin(
      planEntitlements,
      eq(planEntitlements.planId, plans.id)
    )
    .leftJoin(
      entitlements,
      eq(entitlements.id, planEntitlements.entitlementId)
    )
    .where(eq(stores.id, storeId));

  return effectiveStoreEntitlementsFromRows(
    storeId,
    rows as StoreEntitlementRow[]
  );
}
