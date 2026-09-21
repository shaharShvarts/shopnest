"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { parseStoreId } from "@/lib/merchant-stores/core";
import {
  MerchantSubscriptionError,
  parsePlanSelection,
} from "@/lib/merchant-subscriptions/core";
import { getMerchantSubscriptionRepository } from "@/lib/merchant-subscriptions/server";
import { ActivationOrchestrationError } from "@/lib/activation-orchestration/core";
import { getActivationOrchestrationService } from "@/lib/activation-orchestration/server";

function redirectForPlanError(storeId: number, error: unknown): never {
  const reason =
    error instanceof MerchantSubscriptionError &&
    (error.code === "STORE_PROVISIONED" ||
      error.code === "SUBSCRIPTION_LOCKED")
      ? "locked"
      : "unavailable";

  redirect("/dashboard/stores/" + storeId + "?plan=" + reason);
}

export async function selectStorePlanAction(formData: FormData) {
  const merchant = await requireMerchantPage();

  let storeId: number;
  let selection;
  try {
    storeId = parseStoreId(formData.get("storeId"));
    selection = parsePlanSelection(Object.fromEntries(formData));
  } catch {
    redirect("/dashboard/stores");
  }

  try {
    await getMerchantSubscriptionRepository().selectPlanForOwnedStore(
      merchant.id,
      storeId,
      selection
    );
  } catch (error) {
    redirectForPlanError(storeId, error);
  }

  revalidatePath("/dashboard/stores/" + storeId);
  redirect("/dashboard/stores/" + storeId + "?plan=saved");
}


function activationRedirectReason(error: unknown) {
  if (error instanceof ActivationOrchestrationError) {
    if (
      error.code === "STORE_NOT_READY" ||
      error.code === "READINESS_REGRESSED"
    ) {
      return "not-ready";
    }

    if (error.code === "PLAN_NOT_PROVISIONABLE") {
      return "plan";
    }
  }

  return "failed";
}

export async function activateStoreAction(formData: FormData) {
  const merchant = await requireMerchantPage();

  let storeId: number;
  try {
    storeId = parseStoreId(formData.get("storeId"));
  } catch {
    redirect("/dashboard/stores");
  }

  try {
    await getActivationOrchestrationService().activateOwnedStore(
      merchant.id,
      storeId
    );
  } catch (error) {
    redirect(
      "/dashboard/stores/" +
        storeId +
        "?activation=" +
        activationRedirectReason(error)
    );
  }

  revalidatePath("/dashboard/stores/" + storeId);
  redirect("/dashboard/stores/" + storeId + "?activation=success");
}
