"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  createEntitlementForAdmin,
  createPlanForAdmin,
  listPlanAdministration,
  updatePlanForAdmin,
} from "@/lib/plan-administration/server";
import { parseIlsToMinor } from "@/lib/plan-administration/core";

function plansPath(result?: string) {
  return result ? `/admin/plans?result=${encodeURIComponent(result)}` : "/admin/plans";
}

export async function createPlanAction(formData: FormData) {
  try {
    await createPlanForAdmin({
      code: formData.get("code"),
      name: formData.get("name"),
    });
  } catch {
    redirect(plansPath("PLAN_CREATE_FAILED"));
  }

  revalidatePath("/admin/plans");
  redirect(plansPath("PLAN_CREATED"));
}

export async function createEntitlementAction(formData: FormData) {
  try {
    await createEntitlementForAdmin({
      code: formData.get("code"),
      name: formData.get("name"),
      description:
        typeof formData.get("description") === "string" &&
        String(formData.get("description")).trim()
          ? String(formData.get("description")).trim()
          : null,
      valueType: formData.get("valueType"),
    });
  } catch {
    redirect(plansPath("ENTITLEMENT_CREATE_FAILED"));
  }

  revalidatePath("/admin/plans");
  redirect(plansPath("ENTITLEMENT_CREATED"));
}

export async function updatePlanAction(formData: FormData) {
  const planId = Number(formData.get("planId"));
  if (!Number.isSafeInteger(planId) || planId <= 0) {
    redirect(plansPath("PLAN_UPDATE_FAILED"));
  }

  try {
    const plans = await listPlanAdministration();
    const plan = plans.find((candidate) => candidate.id === planId);
    if (!plan) redirect(plansPath("PLAN_UPDATE_FAILED"));

    const entitlementValues: Record<string, number> = {};
    for (const entitlement of plan.entitlements) {
      const raw = formData.get(`entitlement_${entitlement.id}`);
      if (typeof raw !== "string" || raw.trim() === "") continue;
      const value = Number(raw);
      if (!Number.isSafeInteger(value)) {
        redirect(plansPath("PLAN_UPDATE_FAILED"));
      }
      entitlementValues[String(entitlement.id)] = value;
    }

    await updatePlanForAdmin({
      planId,
      name: formData.get("name"),
      status: formData.get("status"),
      monthlyAmountMinor: parseIlsToMinor(formData.get("monthlyPrice")),
      annualAmountMinor: parseIlsToMinor(formData.get("annualPrice")),
      entitlementValues,
    });
  } catch {
    redirect(plansPath("PLAN_UPDATE_FAILED"));
  }

  revalidatePath("/admin/plans");
  revalidatePath("/dashboard/stores");
  redirect(plansPath("PLAN_UPDATED"));
}
