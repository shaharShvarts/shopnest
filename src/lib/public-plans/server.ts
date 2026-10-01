import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/db";
import { planPrices, plans } from "@/drizzle/control-plane-schema";

export type PublicPlan = {
  id: number;
  code: string;
  name: string;
  monthlyAmountMinor: number | null;
  annualAmountMinor: number | null;
};

export async function listPublicPlans(): Promise<PublicPlan[]> {
  const db = getControlPlaneDb();

  const [planRows, priceRows] = await Promise.all([
    db
      .select({
        id: plans.id,
        code: plans.code,
        name: plans.name,
      })
      .from(plans)
      .where(eq(plans.status, "active"))
      .orderBy(asc(plans.id)),
    db
      .select({
        planId: planPrices.planId,
        billingInterval: planPrices.billingInterval,
        amountMinor: planPrices.amountMinor,
      })
      .from(planPrices)
      .where(eq(planPrices.currency, "ILS")),
  ]);

  return planRows.map((plan) => ({
    ...plan,
    monthlyAmountMinor:
      priceRows.find(
        (price) =>
          price.planId === plan.id &&
          price.billingInterval === "monthly"
      )?.amountMinor ?? null,
    annualAmountMinor:
      priceRows.find(
        (price) =>
          price.planId === plan.id &&
          price.billingInterval === "annual"
      )?.amountMinor ?? null,
  }));
}

export function formatPublicIlsPrice(amountMinor: number | null) {
  if (amountMinor === null) return null;
  return new Intl.NumberFormat("he-IL", {
    style: "currency",
    currency: "ILS",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amountMinor / 100);
}
