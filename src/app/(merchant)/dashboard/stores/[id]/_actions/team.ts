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

function resultFor(error: unknown) {
  if (error instanceof StoreTeamError) {
    return { ok: false as const, code: error.code };
  }
  if (error instanceof Error && error.message.includes("at least 12 characters")) {
    return { ok: false as const, code: "INVALID_MANAGER_ACCOUNT" as const };
  }
  throw error;
}

function revalidateTeam(storeId: number) {
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/dashboard/stores/${storeId}/team`);
}

export async function createStoreManagerAction(
  storeId: number,
  input: unknown
) {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, code: "INVALID_MANAGER_ACCOUNT" as const };
  }
  try {
    await createOwnedStoreManager(storeId, parsed.data.email, parsed.data.password);
    revalidateTeam(storeId);
    return { ok: true as const };
  } catch (error) {
    return resultFor(error);
  }
}

export async function assignExistingStoreManagerAction(
  storeId: number,
  input: unknown
) {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, code: "INVALID_MANAGER_ACCOUNT" as const };
  }
  try {
    await assignExistingOwnedStoreManager(storeId, parsed.data.email);
    revalidateTeam(storeId);
    return { ok: true as const };
  } catch (error) {
    return resultFor(error);
  }
}

export async function removeStoreManagerAction(
  storeId: number,
  adminUserId: number
) {
  if (!Number.isSafeInteger(adminUserId) || adminUserId <= 0) {
    return { ok: false as const, code: "MANAGER_NOT_FOUND" as const };
  }
  await removeOwnedStoreManager(storeId, adminUserId);
  revalidateTeam(storeId);
  return { ok: true as const };
}
