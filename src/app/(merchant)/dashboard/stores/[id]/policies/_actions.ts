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

function parsePolicyForm(formData: FormData) {
  return {
    storeId: parseStoreId(formData.get("storeId")),
    input: parsePolicyDocumentInput(Object.fromEntries(formData)),
  };
}

export async function savePolicyDraftAction(formData: FormData) {
  const merchant = await requireMerchantPage();

  let parsed;
  try {
    parsed = parsePolicyForm(formData);
  } catch {
    redirect("/dashboard/stores");
  }

  try {
    await getMerchantPolicyRepository().saveDraftForOwnedStore(
      merchant.id,
      parsed.storeId,
      parsed.input
    );
  } catch (error) {
    redirectForPolicyError(parsed.storeId, error);
  }

  revalidatePath("/dashboard/stores/" + parsed.storeId);
  revalidatePath("/dashboard/stores/" + parsed.storeId + "/policies");
  redirect(
    "/dashboard/stores/" + parsed.storeId + "/policies?policy=saved"
  );
}

export async function publishPolicyAction(formData: FormData) {
  const merchant = await requireMerchantPage();

  let parsed;
  try {
    parsed = parsePolicyForm(formData);
  } catch {
    redirect("/dashboard/stores");
  }

  try {
    await getMerchantPolicyRepository().publishForOwnedStore(
      merchant.id,
      parsed.storeId,
      parsed.input
    );
  } catch (error) {
    redirectForPolicyError(parsed.storeId, error);
  }

  revalidatePath("/dashboard/stores/" + parsed.storeId);
  revalidatePath("/dashboard/stores/" + parsed.storeId + "/policies");
  redirect(
    "/dashboard/stores/" + parsed.storeId + "/policies?policy=published"
  );
}
