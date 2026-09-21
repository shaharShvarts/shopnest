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

function redirectForPlanError(storeId: number, error: unknown): never {
  const reason =
    error instanceof MerchantSubscriptionError &&
    error.code === "STORE_PROVISIONED"
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
