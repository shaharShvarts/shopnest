"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  loginMerchantAction,
  requestMerchantPasswordResetAction,
  resetMerchantPasswordAction,
  signupMerchantAction,
  type MerchantAuthActionState,
  type MerchantForgotPasswordActionState,
} from "../_actions/merchant-auth";

const initialAuthState: MerchantAuthActionState = { success: false };
const initialForgotState: MerchantForgotPasswordActionState = { submitted: false };

const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring";
const buttonClass =
  "min-h-11 w-full rounded-lg bg-foreground px-4 py-2 font-semibold text-background disabled:cursor-not-allowed disabled:opacity-60";

function ErrorMessage({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {message}
    </p>
  );
}

export function MerchantSignupForm() {
  const t = useTranslations("MerchantAuth");
  const [state, action, pending] = useActionState(signupMerchantAction, initialAuthState);

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="merchant-signup-name" className="mb-1 block text-sm font-medium">{t("name")}</label>
        <input id="merchant-signup-name" name="name" autoComplete="name" required maxLength={160} className={inputClass} />
      </div>
      <div>
        <label htmlFor="merchant-signup-email" className="mb-1 block text-sm font-medium">{t("email")}</label>
        <input id="merchant-signup-email" name="email" type="email" autoComplete="email" required maxLength={320} className={inputClass} />
      </div>
      <div>
        <label htmlFor="merchant-signup-phone" className="mb-1 block text-sm font-medium">{t("phone")}</label>
        <input id="merchant-signup-phone" name="phone" type="tel" autoComplete="tel" required maxLength={64} className={inputClass} />
      </div>
      <div>
        <label htmlFor="merchant-signup-password" className="mb-1 block text-sm font-medium">{t("password")}</label>
        <input id="merchant-signup-password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} className={inputClass} />
        <p className="mt-1 text-xs text-muted-foreground">{t("passwordHint")}</p>
      </div>
      <ErrorMessage message={state.message ? t(state.message) : undefined} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t("creatingAccount") : t("createAccount")}
      </button>
      <p className="text-center text-sm text-muted-foreground">
        {t("hasAccount")}{" "}
        <Link href="/login" className="min-h-11 font-semibold text-foreground underline underline-offset-4">{t("signIn")}</Link>
      </p>
    </form>
  );
}

export function MerchantLoginForm() {
  const t = useTranslations("MerchantAuth");
  const [state, action, pending] = useActionState(loginMerchantAction, initialAuthState);

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="merchant-login-email" className="mb-1 block text-sm font-medium">{t("email")}</label>
        <input id="merchant-login-email" name="email" type="email" autoComplete="email" required maxLength={320} className={inputClass} />
      </div>
      <div>
        <label htmlFor="merchant-login-password" className="mb-1 block text-sm font-medium">{t("password")}</label>
        <input id="merchant-login-password" name="password" type="password" autoComplete="current-password" required maxLength={256} className={inputClass} />
      </div>
      <ErrorMessage message={state.message ? t(state.message) : undefined} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t("signingIn") : t("signIn")}
      </button>
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/forgot-password" className="min-h-11 py-2 font-medium underline underline-offset-4">{t("forgotPassword")}</Link>
        <span className="text-muted-foreground">
          {t("noAccount")}{" "}
          <Link href="/signup" className="font-semibold text-foreground underline underline-offset-4">{t("createAccount")}</Link>
        </span>
      </div>
    </form>
  );
}

export function MerchantForgotPasswordForm() {
  const t = useTranslations("MerchantAuth");
  const [state, action, pending] = useActionState(
    requestMerchantPasswordResetAction,
    initialForgotState
  );

  if (state.submitted) {
    return (
      <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        {t("forgotPasswordNeutralSuccess")}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-5">
      <div>
        <label htmlFor="merchant-forgot-email" className="mb-1 block text-sm font-medium">{t("email")}</label>
        <input id="merchant-forgot-email" name="email" type="email" autoComplete="email" required maxLength={320} className={inputClass} />
      </div>
      <ErrorMessage message={state.message ? t(state.message) : undefined} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t("sendingResetLink") : t("sendResetLink")}
      </button>
      <Link href="/login" className="block min-h-11 py-2 text-center text-sm font-medium underline underline-offset-4">
        {t("backToSignIn")}
      </Link>
    </form>
  );
}

export function MerchantResetPasswordForm({ token }: { token: string }) {
  const t = useTranslations("MerchantAuth");
  const [state, action, pending] = useActionState(resetMerchantPasswordAction, initialAuthState);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="merchant-reset-password" className="mb-1 block text-sm font-medium">{t("newPassword")}</label>
        <input id="merchant-reset-password" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={256} className={inputClass} />
        <p className="mt-1 text-xs text-muted-foreground">{t("passwordHint")}</p>
      </div>
      <ErrorMessage message={state.message ? t(state.message) : undefined} />
      <button type="submit" disabled={pending} className={buttonClass}>
        {pending ? t("resettingPassword") : t("resetPassword")}
      </button>
    </form>
  );
}
