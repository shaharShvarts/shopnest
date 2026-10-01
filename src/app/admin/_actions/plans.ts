"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  addPlanEntitlementForAdmin,
  createPlanForAdmin,
  listPlanAdministration,
  removePlanEntitlementForAdmin,
  updatePlanForAdmin,
} from "@/lib/plan-administration/server";
import {
  parseIlsToMinor,
  planUpdateFormSchema,
  validateEntitlementValue,
} from "@/lib/plan-administration/core";

const PLAN_RESULT_COOKIE = "SHOPNEST_PLAN_RESULT";

async function redirectWithPlanResult(result: string): Promise<never> {
  const cookieStore = await cookies();
  cookieStore.set(PLAN_RESULT_COOKIE, result, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/admin/plans",
    maxAge: 60,
  });
  redirect("/admin/plans");
}

export async function createPlanAction(formData: FormData) {
  try {
    await createPlanForAdmin({
      code: formData.get("code"),
      name: formData.get("name"),
    });
  } catch {
    await redirectWithPlanResult("PLAN_CREATE_FAILED");
  }

  revalidatePath("/admin/plans");
  await redirectWithPlanResult("PLAN_CREATED");
}

export async function addPlanEntitlementAction(formData: FormData) {
  try {
    await addPlanEntitlementForAdmin({
      planId: formData.get("planId"),
      entitlementCode: formData.get("entitlementCode"),
    });
  } catch {
    await redirectWithPlanResult("ENTITLEMENT_ADD_FAILED");
  }

  revalidatePath("/admin/plans");
  await redirectWithPlanResult("ENTITLEMENT_ADDED");
}

export async function removePlanEntitlementAction(
  planId: number,
  entitlementId: number
) {
  try {
    await removePlanEntitlementForAdmin({
      planId,
      entitlementId,
    });
  } catch {
    await redirectWithPlanResult("ENTITLEMENT_REMOVE_FAILED");
  }

  revalidatePath("/admin/plans");
  await redirectWithPlanResult("ENTITLEMENT_REMOVED");
}

export async function updatePlanAction(formData: FormData) {
  try {
    const parsed = planUpdateFormSchema.parse({
      planId: formData.get("planId"),
      name: formData.get("name"),
      status: formData.get("status"),
      monthlyPrice: formData.get("monthlyPrice"),
      annualPrice: formData.get("annualPrice"),
    });

    const plans = await listPlanAdministration();
    const plan = plans.find((candidate) => candidate.id === parsed.planId);
    if (!plan) {
      return await redirectWithPlanResult("PLAN_UPDATE_FAILED");
    }

    const entitlementValues: Record<string, number> = {};
    for (const entitlement of plan.entitlements) {
      const raw = formData.get(`entitlement_${entitlement.id}`);
      if (typeof raw !== "string" || raw.trim() === "") {
        await redirectWithPlanResult("PLAN_UPDATE_FAILED");
      }

      const numericValue = Number(raw);
      const value = validateEntitlementValue(
        entitlement.valueType,
        numericValue
      );
      entitlementValues[String(entitlement.id)] = value;
    }

    await updatePlanForAdmin({
      planId: parsed.planId,
      name: parsed.name,
      status: parsed.status,
      monthlyAmountMinor: parseIlsToMinor(parsed.monthlyPrice),
      annualAmountMinor: parseIlsToMinor(parsed.annualPrice),
      entitlementValues,
    });
  } catch {
    await redirectWithPlanResult("PLAN_UPDATE_FAILED");
  }

  revalidatePath("/admin/plans");
  revalidatePath("/dashboard/stores");
  await redirectWithPlanResult("PLAN_UPDATED");
}
