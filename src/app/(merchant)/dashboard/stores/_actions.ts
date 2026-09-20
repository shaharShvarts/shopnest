"use server";

import { redirect } from "next/navigation";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import {
  MerchantStoreError,
  parseStoreId,
  parseStoreVersion,
  storeProfileSchema,
  validateStoreSlug,
} from "@/lib/merchant-stores/core";
import { getMerchantStoreRepository } from "@/lib/merchant-stores/server";

export type StoreActionMessage =
  | "invalidStoreDetails"
  | "storeUnavailable"
  | "slugUnavailable"
  | "slugLocked"
  | "storeChanged"
  | "storeAlreadyProvisioned"
  | "undoExpired";

export type StoreFormActionState = {
  success: false;
  message?: StoreActionMessage;
  errors?: Record<string, string[] | undefined>;
};

function messageForStoreError(error: unknown): StoreActionMessage {
  if (!(error instanceof MerchantStoreError)) {
    return "storeUnavailable";
  }

  switch (error.code) {
    case "SLUG_UNAVAILABLE":
      return "slugUnavailable";
    case "SLUG_LOCKED":
      return "slugLocked";
    case "CONFLICT":
      return "storeChanged";
    case "TENANT_LINKED":
      return "storeAlreadyProvisioned";
    case "UNDO_EXPIRED":
      return "undoExpired";
    default:
      return "storeUnavailable";
  }
}

export async function createStoreAction(
  _state: StoreFormActionState,
  formData: FormData
): Promise<StoreFormActionState> {
  const merchant = await requireMerchantPage();
  const parsed = storeProfileSchema.safeParse(
    Object.fromEntries(formData)
  );

  if (!parsed.success) {
    return {
      success: false,
      message: "invalidStoreDetails",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  let store;
  try {
    store = await getMerchantStoreRepository().createDraftForMerchant(
      merchant.id,
      parsed.data
    );
  } catch (error) {
    return {
      success: false,
      message: messageForStoreError(error),
    };
  }

  redirect("/dashboard/stores/" + store.id);
}

export async function updateStoreAction(
  _state: StoreFormActionState,
  formData: FormData
): Promise<StoreFormActionState> {
  const merchant = await requireMerchantPage();
  const parsed = storeProfileSchema.safeParse(
    Object.fromEntries(formData)
  );

  if (!parsed.success) {
    return {
      success: false,
      message: "invalidStoreDetails",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  let storeId: number;
  let expectedUpdatedAt: Date;
  try {
    storeId = parseStoreId(formData.get("storeId"));
    expectedUpdatedAt = parseStoreVersion(
      formData.get("expectedUpdatedAt")
    );
  } catch {
    return {
      success: false,
      message: "storeChanged",
    };
  }

  try {
    await getMerchantStoreRepository().updateOwned(
      merchant.id,
      storeId,
      parsed.data,
      expectedUpdatedAt
    );
  } catch (error) {
    return {
      success: false,
      message: messageForStoreError(error),
    };
  }

  redirect("/dashboard/stores/" + storeId);
}

export async function checkStoreSlugAvailabilityAction(input: {
  slug: string;
  currentStoreId?: number;
}) {
  const merchant = await requireMerchantPage();
  const validation = validateStoreSlug(input.slug);

  if (!validation.ok) {
    return {
      available: false as const,
      reason: validation.reason,
    };
  }

  let currentStoreId: number | undefined;
  try {
    currentStoreId =
      input.currentStoreId === undefined
        ? undefined
        : parseStoreId(input.currentStoreId);
  } catch {
    return {
      available: false as const,
      reason: "invalid" as const,
    };
  }

  try {
    const available =
      await getMerchantStoreRepository().isSlugAvailable(
        merchant.id,
        validation.slug,
        currentStoreId
      );

    return {
      available,
      reason: available ? null : ("taken" as const),
      slug: validation.slug,
    };
  } catch {
    return {
      available: false as const,
      reason: "unavailable" as const,
      slug: validation.slug,
    };
  }
}

export async function deleteStoreAction(input: {
  storeId: number;
  expectedUpdatedAt: string;
}) {
  const merchant = await requireMerchantPage();

  try {
    const deleted =
      await getMerchantStoreRepository().softDeleteOwned(
        merchant.id,
        parseStoreId(input.storeId),
        parseStoreVersion(input.expectedUpdatedAt)
      );

    return {
      ok: true as const,
      storeId: deleted.store.id,
      undoVersion: deleted.undoVersion,
      undoExpiresAt: deleted.undoExpiresAt,
    };
  } catch (error) {
    return {
      ok: false as const,
      message: messageForStoreError(error),
    };
  }
}

export async function undoStoreDeleteAction(input: {
  storeId: number;
  expectedUpdatedAt: string;
}) {
  const merchant = await requireMerchantPage();

  try {
    const restored =
      await getMerchantStoreRepository().undoDeleteOwned(
        merchant.id,
        parseStoreId(input.storeId),
        parseStoreVersion(input.expectedUpdatedAt)
      );

    return {
      ok: true as const,
      storeId: restored.id,
      updatedAt: restored.updatedAt.toISOString(),
    };
  } catch (error) {
    return {
      ok: false as const,
      message: messageForStoreError(error),
    };
  }
}
