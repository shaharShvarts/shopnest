"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import {
  MerchantPolicyError,
  parsePolicyDocumentInput,
} from "@/lib/merchant-policies/core";
import { getMerchantPolicyRepository } from "@/lib/merchant-policies/server";
import { parseStoreId } from "@/lib/merchant-stores/core";

function redirectForPolicyError(storeId: number, error: unknown): never {
  if (
    error instanceof MerchantPolicyError &&
    error.code === "STORE_NOT_FOUND"
  ) {
    redirect("/dashboard/stores");
  }

  redirect("/dashboard/stores/" + storeId + "/policies?policy=invalid");
}

function parsePolicyFormForStore(storeId: number, formData: FormData) {
  try {
    return parsePolicyDocumentInput(Object.fromEntries(formData));
  } catch {
    redirect(
      "/dashboard/stores/" + storeId + "/policies?policy=invalid"
    );
  }
}

export async function savePolicyDraftAction(formData: FormData) {
  const merchant = await requireMerchantPage();

  let storeId: number;
  try {
    storeId = parseStoreId(formData.get("storeId"));
  } catch {
    redirect("/dashboard/stores");
  }

  const input = parsePolicyFormForStore(storeId, formData);

  try {
    await getMerchantPolicyRepository().saveDraftForOwnedStore(
      merchant.id,
      storeId,
      input
    );
  } catch (error) {
    redirectForPolicyError(storeId, error);
  }

  revalidatePath("/dashboard/stores/" + storeId);
  revalidatePath("/dashboard/stores/" + storeId + "/policies");
  redirect("/dashboard/stores/" + storeId + "/policies?policy=saved");
}

export async function publishPolicyAction(formData: FormData) {
  const merchant = await requireMerchantPage();

  let storeId: number;
  try {
    storeId = parseStoreId(formData.get("storeId"));
  } catch {
    redirect("/dashboard/stores");
  }

  const input = parsePolicyFormForStore(storeId, formData);

  try {
    await getMerchantPolicyRepository().publishForOwnedStore(
      merchant.id,
      storeId,
      input
    );
  } catch (error) {
    redirectForPolicyError(storeId, error);
  }

  revalidatePath("/dashboard/stores/" + storeId);
  revalidatePath("/dashboard/stores/" + storeId + "/policies");
  redirect(
    "/dashboard/stores/" + storeId + "/policies?policy=published"
  );
}
