"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  addPlanEntitlementForAdmin,
  createPlanForAdmin,
  listPlanAdministration,
  removePlanEntitlementForAdmin,
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

export async function addPlanEntitlementAction(formData: FormData) {
  try {
    await addPlanEntitlementForAdmin({
      planId: formData.get("planId"),
      entitlementCode: formData.get("entitlementCode"),
    });
  } catch {
    redirect(plansPath("ENTITLEMENT_ADD_FAILED"));
  }

  revalidatePath("/admin/plans");
  redirect(plansPath("ENTITLEMENT_ADDED"));
}

export async function removePlanEntitlementAction(formData: FormData) {
  try {
    await removePlanEntitlementForAdmin({
      planId: formData.get("planId"),
      entitlementId: formData.get("entitlementId"),
    });
  } catch {
    redirect(plansPath("ENTITLEMENT_REMOVE_FAILED"));
  }

  revalidatePath("/admin/plans");
  redirect(plansPath("ENTITLEMENT_REMOVED"));
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
