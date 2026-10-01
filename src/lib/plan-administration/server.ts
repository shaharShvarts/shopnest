import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/db";
import {
  entitlements,
  planEntitlements,
  planPrices,
  plans,
} from "@/drizzle/control-plane-schema";
import { requireSuperAdmin } from "@/lib/admin-auth/server";
import {
  createEntitlementSchema,
  createPlanSchema,
  planMutationSchema,
  validateEntitlementValue,
} from "./core";

export async function listPlanAdministration() {
  await requireSuperAdmin();
  const db = getControlPlaneDb();

  const [planRows, entitlementRows, valueRows, priceRows] = await Promise.all([
    db.select().from(plans).orderBy(asc(plans.id)),
    db.select().from(entitlements).orderBy(asc(entitlements.id)),
    db.select().from(planEntitlements),
    db.select().from(planPrices),
  ]);

  return planRows.map((plan) => ({
    ...plan,
    entitlements: entitlementRows.map((entitlement) => ({
      ...entitlement,
      value:
        valueRows.find(
          (row) =>
            row.planId === plan.id &&
            row.entitlementId === entitlement.id
        )?.value ?? null,
    })),
    prices: {
      monthly:
        priceRows.find(
          (row) =>
            row.planId === plan.id &&
            row.billingInterval === "monthly" &&
            row.currency === "ILS"
        )?.amountMinor ?? null,
      annual:
        priceRows.find(
          (row) =>
            row.planId === plan.id &&
            row.billingInterval === "annual" &&
            row.currency === "ILS"
        )?.amountMinor ?? null,
    },
  }));
}

export async function createPlanForAdmin(input: unknown) {
  await requireSuperAdmin();
  const parsed = createPlanSchema.parse(input);
  const [created] = await getControlPlaneDb()
    .insert(plans)
    .values({
      code: parsed.code,
      name: parsed.name,
      status: "active",
    })
    .returning();
  return created;
}

export async function createEntitlementForAdmin(input: unknown) {
  await requireSuperAdmin();
  const parsed = createEntitlementSchema.parse(input);
  const [created] = await getControlPlaneDb()
    .insert(entitlements)
    .values(parsed)
    .returning();
  return created;
}

export async function updatePlanForAdmin(input: unknown) {
  await requireSuperAdmin();
  const parsed = planMutationSchema.parse(input);

  await getControlPlaneDb().transaction(async (tx) => {
    const [plan] = await tx
      .update(plans)
      .set({
        name: parsed.name,
        status: parsed.status,
        updatedAt: new Date(),
      })
      .where(eq(plans.id, parsed.planId))
      .returning({ id: plans.id });

    if (!plan) throw new Error("Plan not found");

    for (const [interval, amountMinor] of [
      ["monthly", parsed.monthlyAmountMinor],
      ["annual", parsed.annualAmountMinor],
    ] as const) {
      if (amountMinor === null) {
        await tx
          .delete(planPrices)
          .where(
            and(
              eq(planPrices.planId, parsed.planId),
              eq(planPrices.billingInterval, interval),
              eq(planPrices.currency, "ILS")
            )
          );
        continue;
      }

      await tx
        .insert(planPrices)
        .values({
          planId: parsed.planId,
          billingInterval: interval,
          currency: "ILS",
          amountMinor,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            planPrices.planId,
            planPrices.billingInterval,
            planPrices.currency,
          ],
          set: {
            amountMinor,
            updatedAt: new Date(),
          },
        });
    }

    const entitlementRows = await tx
      .select({
        id: entitlements.id,
        code: entitlements.code,
        valueType: entitlements.valueType,
      })
      .from(entitlements);

    for (const entitlement of entitlementRows) {
      const rawValue = parsed.entitlementValues[String(entitlement.id)];
      if (rawValue === undefined) {
        await tx
          .delete(planEntitlements)
          .where(
            and(
              eq(planEntitlements.planId, parsed.planId),
              eq(planEntitlements.entitlementId, entitlement.id)
            )
          );
        continue;
      }

      const value = validateEntitlementValue(
        entitlement.valueType,
        rawValue
      );

      await tx
        .insert(planEntitlements)
        .values({
          planId: parsed.planId,
          entitlementId: entitlement.id,
          value,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            planEntitlements.planId,
            planEntitlements.entitlementId,
          ],
          set: {
            value,
            updatedAt: new Date(),
          },
        });
    }
  });
}
