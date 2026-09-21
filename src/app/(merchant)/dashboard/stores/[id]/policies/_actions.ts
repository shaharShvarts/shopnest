"use server";

import { revalidatePath } from "next/cache";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import {
  MerchantPolicyError,
  parsePolicyDocumentInput,
  type StorePolicyStatus,
} from "@/lib/merchant-policies/core";
import { getMerchantPolicyRepository } from "@/lib/merchant-policies/server";
import { parseStoreId } from "@/lib/merchant-stores/core";

export type PolicyMutationState =
  | { kind: "idle" }
  | {
      kind: "saved" | "published";
      mutationId: string;
      version: number;
      documentStatus: StorePolicyStatus;
      title: string;
      content: string;
    }
  | { kind: "invalid" | "unavailable"; mutationId: string };

export async function mutatePolicyAction(
  _previousState: PolicyMutationState,
  formData: FormData
): Promise<PolicyMutationState> {
  const merchant = await requireMerchantPage();
  const mutationId = new Date().toISOString();

  let storeId: number;
  try {
    storeId = parseStoreId(formData.get("storeId"));
  } catch {
    return { kind: "invalid", mutationId };
  }

  const intent = formData.get("intent");
  if (intent !== "draft" && intent !== "publish") {
    return { kind: "invalid", mutationId };
  }

  let input;
  try {
    input = parsePolicyDocumentInput(Object.fromEntries(formData));
  } catch {
    return { kind: "invalid", mutationId };
  }

  try {
    const document =
      intent === "draft"
        ? await getMerchantPolicyRepository().saveDraftForOwnedStore(
            merchant.id,
            storeId,
            input
          )
        : await getMerchantPolicyRepository().publishForOwnedStore(
            merchant.id,
            storeId,
            input
          );

    // Keep the parent Store readiness result fresh without navigating or
    // reloading the current policy workspace.
    revalidatePath("/dashboard/stores/" + storeId);

    return {
      kind: intent === "draft" ? "saved" : "published",
      mutationId,
      version: document.version,
      documentStatus: document.status,
      title: document.title,
      content: document.content,
    };
  } catch (error) {
    if (
      error instanceof MerchantPolicyError &&
      error.code === "STORE_NOT_FOUND"
    ) {
      return { kind: "unavailable", mutationId };
    }

    return { kind: "invalid", mutationId };
  }
}
