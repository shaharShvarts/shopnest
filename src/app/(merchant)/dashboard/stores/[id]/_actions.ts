"use server";

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

function planErrorCode(error: unknown) {
  return error instanceof MerchantSubscriptionError &&
    (error.code === "STORE_PROVISIONED" ||
      error.code === "SUBSCRIPTION_LOCKED")
    ? "locked"
    : "unavailable";
}

export async function selectStorePlanAction(formData: FormData) {
  const merchant = await requireMerchantPage();

  let storeId: number;
  let selection;
  try {
    storeId = parseStoreId(formData.get("storeId"));
    selection = parsePlanSelection(Object.fromEntries(formData));
  } catch {
    return { ok: false as const, code: "unavailable" };
  }

  try {
    await getMerchantSubscriptionRepository().selectPlanForOwnedStore(
      merchant.id,
      storeId,
      selection
    );
  } catch (error) {
    return { ok: false as const, code: planErrorCode(error) };
  }

  revalidatePath("/dashboard/stores/" + storeId);
  return { ok: true as const, code: "saved" };
}

function activationResultCode(error: unknown) {
  if (error instanceof ActivationOrchestrationError) {
    if (
      error.code === "STORE_NOT_READY" ||
      error.code === "READINESS_REGRESSED"
    ) {
      return "not-ready";
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
    return { ok: false as const, code: "failed" };
  }

  try {
    await getActivationOrchestrationService().activateOwnedStore(
      merchant.id,
      storeId
    );
  } catch (error) {
    return { ok: false as const, code: activationResultCode(error) };
  }

  revalidatePath("/dashboard/stores/" + storeId);
  return { ok: true as const, code: "success" };
}
