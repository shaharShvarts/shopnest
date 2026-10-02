"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  authenticateAdmin,
  createAdminSession,
  logoutAdmin,
  resolveAdminSession,
} from "@/lib/admin-auth/core";
import { shouldUseSecureAdminCookie } from "@/lib/admin-auth/cookie";
import {
  ADMIN_SESSION_COOKIE,
  getAdminAuthRepository,
} from "@/lib/admin-auth/server";
import { getStoreManagementRepository } from "@/lib/store-management/server";
import {
  authenticateMerchant,
  beginMerchantSignup,
  completeMerchantSignup,
  createMerchantSession,
  MERCHANT_PASSWORD_MIN_LENGTH,
  requestMerchantPasswordReset,
  resendMerchantSignupVerification,
  resetMerchantPassword,
} from "@/lib/merchant-auth/core";
import {
  getMerchantSessionCookieOptions,
  resolveMerchantRequestOrigin,
} from "@/lib/merchant-auth/cookie";
import { normalizeMerchantPhone } from "@/lib/merchant-auth/phone";
import { createMerchantPasswordResetDelivery } from "@/lib/merchant-auth/password-reset-delivery";
import { createMerchantSignupDelivery } from "@/lib/merchant-auth/signup-delivery";
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

const completeSignupSchema = z.object({
  token: z.string().min(1).max(512),
  password: z.string().min(MERCHANT_PASSWORD_MIN_LENGTH).max(256),
  passwordConfirmation: z.string().min(MERCHANT_PASSWORD_MIN_LENGTH).max(256),
});

const resendSignupSchema = z.object({
  token: z.string().min(1).max(512),
});

const passwordResetDelivery = createMerchantPasswordResetDelivery();

export type MerchantSignupActionState = {
  submitted: boolean;
  message?:
    | "invalidAccountDetails"
    | "accountUnavailable"
    | "verificationRecentlySent"
    | "verificationRateLimited"
    | "emailDeliveryFailed";
  errors?: Record<string, string[] | undefined>;
};

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
  _state: MerchantSignupActionState,
  formData: FormData
): Promise<MerchantSignupActionState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      submitted: false,
      message: "invalidAccountDetails",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const origin = await merchantRequestOrigin();
  if (!origin) {
    return { submitted: false, message: "emailDeliveryFailed" };
  }

  try {
    const result = await beginMerchantSignup(
      getMerchantAuthRepository(),
      createMerchantSignupDelivery(),
      {
        email: parsed.data.email,
        displayName: parsed.data.name,
        phone: parsed.data.phone,
        buildVerificationUrl: (token) =>
          new URL(
            `/complete-signup?token=${encodeURIComponent(token)}`,
            origin
          ).toString(),
      }
    );

    if (result.kind === "cooldown") {
      return { submitted: false, message: "verificationRecentlySent" };
    }
    if (result.kind === "rate_limited") {
      return { submitted: false, message: "verificationRateLimited" };
    }
    if (result.kind === "unavailable") {
      return { submitted: false, message: "accountUnavailable" };
    }

    return { submitted: true };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "account_unavailable"
    ) {
      return { submitted: false, message: "accountUnavailable" };
    }
    return { submitted: false, message: "emailDeliveryFailed" };
  }
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

  if (merchant) {
    const cookieStore = await cookies();
    await clearAdminSession(cookieStore);
    await logoutMerchantToken(cookieStore.get(MERCHANT_SESSION_COOKIE)?.value);
    const session = await createMerchantSession(repository, merchant.id);
    await setMerchantSessionCookie(cookieStore, session);
    redirect("/dashboard");
  }

  const adminRepository = getAdminAuthRepository();
  const admin = await authenticateAdmin(
    adminRepository,
    parsed.data.email,
    parsed.data.password
  );
  if (!admin || admin.role !== "tenant_admin") {
    return { success: false, message: "invalidCredentials" };
  }

  const managerSession = await createAdminSession(adminRepository, admin.id);
  const managerPrincipal = await resolveAdminSession(
    adminRepository,
    managerSession.token
  );
  const managedStores =
    await getStoreManagementRepository().listManagedStores(admin.id);

  if (
    !managerPrincipal ||
    managerPrincipal.tenantSlugs.length > 0 ||
    managedStores.length === 0
  ) {
    await logoutAdmin(adminRepository, managerSession.token);
    return { success: false, message: "invalidCredentials" };
  }

  const cookieStore = await cookies();
  await logoutMerchantToken(cookieStore.get(MERCHANT_SESSION_COOKIE)?.value);
  cookieStore.delete(MERCHANT_SESSION_COOKIE);
  await clearAdminSession(cookieStore);
  await setAdminSessionCookie(cookieStore, managerSession);
  redirect("/dashboard");
}

export type MerchantCompleteSignupActionState = {
  success: false;
  message?: "invalidNewPassword" | "passwordMismatch" | "invalidSignupLink";
};

export async function completeMerchantSignupAction(
  _state: MerchantCompleteSignupActionState,
  formData: FormData
): Promise<MerchantCompleteSignupActionState> {
  const parsed = completeSignupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: "invalidNewPassword" };
  }
  if (parsed.data.password !== parsed.data.passwordConfirmation) {
    return { success: false, message: "passwordMismatch" };
  }

  const result = await completeMerchantSignup(getMerchantAuthRepository(), {
    token: parsed.data.token,
    password: parsed.data.password,
  });

  if (result.kind === "expired") {
    redirect(
      `/complete-signup?token=${encodeURIComponent(parsed.data.token)}`
    );
  }
  if (result.kind === "invalid" || result.kind === "invalid_password") {
    return { success: false, message: "invalidSignupLink" };
  }
  if (result.kind === "already_completed") {
    redirect("/login");
  }

  const cookieStore = await cookies();
  await clearAdminSession(cookieStore);
  await logoutMerchantToken(cookieStore.get(MERCHANT_SESSION_COOKIE)?.value);
  const session = await createMerchantSession(
    getMerchantAuthRepository(),
    result.merchantId
  );
  await setMerchantSessionCookie(cookieStore, session);
  redirect("/dashboard");
}

export type MerchantSignupResendActionState = {
  submitted: boolean;
  message?:
    | "invalidSignupLink"
    | "verificationRecentlySent"
    | "verificationRateLimited"
    | "emailDeliveryFailed";
};

export async function resendMerchantSignupAction(
  _state: MerchantSignupResendActionState,
  formData: FormData
): Promise<MerchantSignupResendActionState> {
  const parsed = resendSignupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { submitted: false, message: "invalidSignupLink" };
  }

  const origin = await merchantRequestOrigin();
  if (!origin) {
    return { submitted: false, message: "emailDeliveryFailed" };
  }

  try {
    const result = await resendMerchantSignupVerification(
      getMerchantAuthRepository(),
      createMerchantSignupDelivery(),
      {
        token: parsed.data.token,
        buildVerificationUrl: (token) =>
          new URL(
            `/complete-signup?token=${encodeURIComponent(token)}`,
            origin
          ).toString(),
      }
    );

    if (result.kind === "sent") return { submitted: true };
    if (result.kind === "cooldown") {
      return { submitted: false, message: "verificationRecentlySent" };
    }
    if (result.kind === "rate_limited") {
      return { submitted: false, message: "verificationRateLimited" };
    }
    if (result.kind === "completed") {
      redirect(
        `/complete-signup?token=${encodeURIComponent(parsed.data.token)}`
      );
    }
    return { submitted: false, message: "invalidSignupLink" };
  } catch {
    return { submitted: false, message: "emailDeliveryFailed" };
  }
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

  const origin = await merchantRequestOrigin();
  if (!origin) return { submitted: true };

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

async function merchantRequestOrigin() {
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

async function clearAdminSession(
  cookieStore: Awaited<ReturnType<typeof cookies>>
) {
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
  if (token) {
    await logoutAdmin(getAdminAuthRepository(), token);
  }
  cookieStore.delete(ADMIN_SESSION_COOKIE);
}

async function setAdminSessionCookie(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  session: { token: string; expiresAt: Date }
) {
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
}
