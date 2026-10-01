"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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

function teamPath(storeId: number, result?: string) {
  const base = `/dashboard/stores/${storeId}/team`;
  return result ? `${base}?result=${encodeURIComponent(result)}` : base;
}

function revalidateTeam(storeId: number) {
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(teamPath(storeId));
}

export async function createStoreManagerAction(
  storeId: number,
  formData: FormData
) {
  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(teamPath(storeId, "INVALID_MANAGER_ACCOUNT"));
  }

  try {
    await createOwnedStoreManager(
      storeId,
      parsed.data.email,
      parsed.data.password
    );
  } catch (error) {
    redirect(teamPath(storeId, teamResultCode(error)));
  }

  revalidateTeam(storeId);
  redirect(teamPath(storeId, "CREATED"));
}

export async function assignExistingStoreManagerAction(
  storeId: number,
  formData: FormData
) {
  const parsed = assignSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(teamPath(storeId, "INVALID_MANAGER_ACCOUNT"));
  }

  try {
    await assignExistingOwnedStoreManager(storeId, parsed.data.email);
  } catch (error) {
    redirect(teamPath(storeId, teamResultCode(error)));
  }

  revalidateTeam(storeId);
  redirect(teamPath(storeId, "ASSIGNED"));
}

export async function removeStoreManagerAction(
  storeId: number,
  formData: FormData
) {
  const adminUserId = Number(formData.get("adminUserId"));
  if (!Number.isSafeInteger(adminUserId) || adminUserId <= 0) {
    redirect(teamPath(storeId, "MANAGER_NOT_FOUND"));
  }

  await removeOwnedStoreManager(storeId, adminUserId);
  revalidateTeam(storeId);
  redirect(teamPath(storeId, "REMOVED"));
}
