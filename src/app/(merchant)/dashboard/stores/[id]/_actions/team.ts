"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resolveMerchantRequestOrigin } from "@/lib/merchant-auth/cookie";
import {
  inviteOwnedStoreManager,
  removeOwnedStoreManager,
} from "@/lib/store-team/server";
import { StoreTeamError } from "@/lib/store-team/core";

const inviteSchema = z.object({
  email: z.string().trim().email().max(320),
});

function teamResultCode(error: unknown) {
  if (error instanceof StoreTeamError) return error.code;
  return "INVITATION_EMAIL_FAILED" as const;
}

function revalidateTeam(storeId: number) {
  revalidatePath(`/dashboard/stores/${storeId}`);
  revalidatePath(`/dashboard/stores/${storeId}/team`);
}

async function managerInvitationOrigin() {
  const requestHeaders = await headers();
  try {
    return resolveMerchantRequestOrigin({
      origin: requestHeaders.get("origin"),
      forwardedProto: requestHeaders.get("x-forwarded-proto"),
      forwardedHost: requestHeaders.get("x-forwarded-host"),
      host: requestHeaders.get("host"),
      nodeEnv: process.env.NODE_ENV,
    });
  } catch {
    return null;
  }
}

export async function inviteStoreManagerAction(
  storeId: number,
  formData: FormData
) {
  const parsed = inviteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false as const, code: "INVALID_MANAGER_ACCOUNT" as const };
  }

  const origin = await managerInvitationOrigin();
  if (!origin) {
    return { ok: false as const, code: "INVITATION_EMAIL_FAILED" as const };
  }

  try {
    const result = await inviteOwnedStoreManager(
      storeId,
      parsed.data.email,
      (token) =>
        new URL(
          `/complete-manager-invite?token=${encodeURIComponent(token)}`,
          origin
        ).toString()
    );

    revalidateTeam(storeId);
    return {
      ok: true as const,
      code:
        result.kind === "assigned_existing"
          ? ("ASSIGNED" as const)
          : ("INVITED" as const),
    };
  } catch (error) {
    return { ok: false as const, code: teamResultCode(error) };
  }
}

export async function removeStoreManagerAction(
  storeId: number,
  formData: FormData
) {
  const adminUserId = Number(formData.get("adminUserId"));
  if (!Number.isSafeInteger(adminUserId) || adminUserId <= 0) {
    return { ok: false as const, code: "MANAGER_NOT_FOUND" as const };
  }

  try {
    await removeOwnedStoreManager(storeId, adminUserId);
  } catch (error) {
    return { ok: false as const, code: teamResultCode(error) };
  }

  revalidateTeam(storeId);
  return { ok: true as const, code: "REMOVED" as const };
}
