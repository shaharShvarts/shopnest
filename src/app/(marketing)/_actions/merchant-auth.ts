"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  authenticateMerchant,
  createMerchantSession,
  MERCHANT_PASSWORD_MIN_LENGTH,
  registerMerchant,
  requestMerchantPasswordReset,
  resetMerchantPassword,
} from "@/lib/merchant-auth/core";
import {
  getMerchantSessionCookieOptions,
  resolveMerchantRequestOrigin,
} from "@/lib/merchant-auth/cookie";
import { normalizeMerchantPhone } from "@/lib/merchant-auth/phone";
import { createMerchantPasswordResetDelivery } from "@/lib/merchant-auth/password-reset-delivery";
import {
  getMerchantAuthRepository,
  logoutMerchantToken,
  MERCHANT_SESSION_COOKIE,
} from "@/lib/merchant-auth/server";

const signupSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320),
  phone: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((value) => {
      try {
        normalizeMerchantPhone(value);
        return true;
      } catch {
        return false;
      }
    }, "invalid_phone"),
  password: z.string().min(MERCHANT_PASSWORD_MIN_LENGTH).max(256),
});

const loginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(256),
});

const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(320),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(MERCHANT_PASSWORD_MIN_LENGTH).max(256),
});

const passwordResetDelivery = createMerchantPasswordResetDelivery();

export type MerchantAuthActionState = {
  success: false;
  message?:
    | "invalidAccountDetails"
    | "accountUnavailable"
    | "invalidCredentials"
    | "invalidEmail"
    | "invalidResetLink"
    | "invalidNewPassword";
  errors?: Record<string, string[] | undefined>;
};

export async function signupMerchantAction(
  _state: MerchantAuthActionState,
  formData: FormData
): Promise<MerchantAuthActionState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      success: false,
      message: "invalidAccountDetails",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const repository = getMerchantAuthRepository();
  let merchant;
  try {
    merchant = await registerMerchant(repository, {
      email: parsed.data.email,
      password: parsed.data.password,
      displayName: parsed.data.name,
      phone: parsed.data.phone,
    });
  } catch {
    return { success: false, message: "accountUnavailable" };
  }

  const cookieStore = await cookies();
  await logoutMerchantToken(cookieStore.get(MERCHANT_SESSION_COOKIE)?.value);
  const session = await createMerchantSession(repository, merchant.id);
  await setMerchantSessionCookie(cookieStore, session);
  redirect("/dashboard");
}

export async function loginMerchantAction(
  _state: MerchantAuthActionState,
  formData: FormData
): Promise<MerchantAuthActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { success: false, message: "invalidCredentials" };

  const repository = getMerchantAuthRepository();
  const merchant = await authenticateMerchant(
    repository,
    parsed.data.email,
    parsed.data.password
  );
  if (!merchant) return { success: false, message: "invalidCredentials" };

  const cookieStore = await cookies();
  await logoutMerchantToken(cookieStore.get(MERCHANT_SESSION_COOKIE)?.value);
  const session = await createMerchantSession(repository, merchant.id);
  await setMerchantSessionCookie(cookieStore, session);
  redirect("/dashboard");
}

export type MerchantForgotPasswordActionState = {
  submitted: boolean;
  message?: "invalidEmail";
};

export async function requestMerchantPasswordResetAction(
  _state: MerchantForgotPasswordActionState,
  formData: FormData
): Promise<MerchantForgotPasswordActionState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { submitted: false, message: "invalidEmail" };

  const requestHeaders = await headers();
  let origin: string;
  try {
    origin = resolveMerchantRequestOrigin({
      origin: requestHeaders.get("origin"),
      forwardedProto: requestHeaders.get("x-forwarded-proto"),
      forwardedHost: requestHeaders.get("x-forwarded-host"),
      host: requestHeaders.get("host"),
      nodeEnv: process.env.NODE_ENV,
    });
  } catch {
    return { submitted: true };
  }

  await requestMerchantPasswordReset(
    getMerchantAuthRepository(),
    passwordResetDelivery,
    {
      email: parsed.data.email,
      buildResetUrl: (token) =>
        new URL(
          `/reset-password?token=${encodeURIComponent(token)}`,
          origin
        ).toString(),
    }
  );

  return { submitted: true };
}

export async function resetMerchantPasswordAction(
  _state: MerchantAuthActionState,
  formData: FormData
): Promise<MerchantAuthActionState> {
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: "invalidNewPassword" };
  }

  const reset = await resetMerchantPassword(getMerchantAuthRepository(), {
    token: parsed.data.token,
    password: parsed.data.password,
  });
  if (!reset) return { success: false, message: "invalidResetLink" };

  const cookieStore = await cookies();
  cookieStore.delete(MERCHANT_SESSION_COOKIE);
  redirect("/login?reset=success");
}

async function setMerchantSessionCookie(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  session: { token: string; expiresAt: Date; maxAgeSeconds: number }
) {
  const requestHeaders = await headers();
  cookieStore.set(
    MERCHANT_SESSION_COOKIE,
    session.token,
    getMerchantSessionCookieOptions(session, {
      origin: requestHeaders.get("origin"),
      forwardedProto: requestHeaders.get("x-forwarded-proto"),
      nodeEnv: process.env.NODE_ENV,
    })
  );
}
