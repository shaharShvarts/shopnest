"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  createAdminSession,
  logoutAdmin,
} from "@/lib/admin-auth/core";
import { shouldUseSecureAdminCookie } from "@/lib/admin-auth/cookie";
import {
  ADMIN_SESSION_COOKIE,
  getAdminAuthRepository,
} from "@/lib/admin-auth/server";
import {
  logoutMerchantToken,
  MERCHANT_SESSION_COOKIE,
} from "@/lib/merchant-auth/server";
import {
  completeStoreManagerInvitation,
} from "@/lib/store-team/server";
import { StoreTeamError } from "@/lib/store-team/core";

const schema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(12).max(256),
  passwordConfirmation: z.string().min(12).max(256),
});

export type CompleteManagerInviteActionState = {
  success: false;
  message?:
    | "invalidPassword"
    | "passwordMismatch"
    | "invalidInvitation"
    | "invitationExpired"
    | "managerLimitReached";
};

export async function completeManagerInviteAction(
  _state: CompleteManagerInviteActionState,
  formData: FormData
): Promise<CompleteManagerInviteActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: "invalidPassword" };
  }

  if (parsed.data.password !== parsed.data.passwordConfirmation) {
    return { success: false, message: "passwordMismatch" };
  }

  let completed: { adminUserId: number; email: string };
  try {
    completed = await completeStoreManagerInvitation(
      parsed.data.token,
      parsed.data.password
    );
  } catch (error) {
    if (error instanceof StoreTeamError) {
      if (error.code === "INVITATION_EXPIRED") {
        return { success: false, message: "invitationExpired" };
      }
      if (error.code === "MANAGER_LIMIT_REACHED") {
        return { success: false, message: "managerLimitReached" };
      }
      return { success: false, message: "invalidInvitation" };
    }
    return { success: false, message: "invalidInvitation" };
  }

  const cookieStore = await cookies();
  const adminRepository = getAdminAuthRepository();

  const existingAdminToken = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (existingAdminToken) {
    await logoutAdmin(adminRepository, existingAdminToken);
  }

  const merchantToken = cookieStore.get(MERCHANT_SESSION_COOKIE)?.value;
  if (merchantToken) {
    await logoutMerchantToken(merchantToken);
  }
  cookieStore.delete(MERCHANT_SESSION_COOKIE);

  const session = await createAdminSession(
    adminRepository,
    completed.adminUserId
  );

  const requestHeaders = await headers();
  cookieStore.set(ADMIN_SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: shouldUseSecureAdminCookie({
      origin: requestHeaders.get("origin"),
      forwardedProto: requestHeaders.get("x-forwarded-proto"),
      nodeEnv: process.env.NODE_ENV,
    }),
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });

  redirect("/dashboard");
}
