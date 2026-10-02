"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  assignExistingOwnedStoreManager,
  createOwnedStoreManager,
  removeOwnedStoreManager,
} from "@/lib/store-team/server";
import { StoreTeamError } from "@/lib/store-team/core";

const createSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(12).max(256),
});

const assignSchema = z.object({
  email: z.string().trim().email().max(320),
});

function teamResultCode(error: unknown) {
  if (error instanceof StoreTeamError) return error.code;
  if (
    error instanceof Error &&
    error.message.includes("at least 12 characters")
  ) {
    return "INVALID_MANAGER_ACCOUNT";
  }
  throw error;
}

function revalidateTeam(storeId: number) {
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/dashboard/stores/${storeId}/team`);
}

export async function createStoreManagerAction(
  storeId: number,
  formData: FormData
) {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, code: "INVALID_MANAGER_ACCOUNT" };
  }

  try {
    await createOwnedStoreManager(
      storeId,
      parsed.data.email,
      parsed.data.password
    );
  } catch (error) {
    return { ok: false as const, code: teamResultCode(error) };
  }

  revalidateTeam(storeId);
  return { ok: true as const, code: "CREATED" };
}

export async function assignExistingStoreManagerAction(
  storeId: number,
  formData: FormData
) {
  const parsed = assignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, code: "INVALID_MANAGER_ACCOUNT" };
  }

  try {
    await assignExistingOwnedStoreManager(storeId, parsed.data.email);
  } catch (error) {
    return { ok: false as const, code: teamResultCode(error) };
  }

  revalidateTeam(storeId);
  return { ok: true as const, code: "ASSIGNED" };
}

export async function removeStoreManagerAction(
  storeId: number,
  formData: FormData
) {
  const adminUserId = Number(formData.get("adminUserId"));
  if (!Number.isSafeInteger(adminUserId) || adminUserId <= 0) {
    return { ok: false as const, code: "MANAGER_NOT_FOUND" };
  }

  try {
    await removeOwnedStoreManager(storeId, adminUserId);
  } catch (error) {
    return { ok: false as const, code: teamResultCode(error) };
  }

  revalidateTeam(storeId);
  return { ok: true as const, code: "REMOVED" };
}
