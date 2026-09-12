"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TenantLink } from "@/components/TenantLink";
import {
  forgotCustomerPasswordAction,
  type ForgotPasswordActionState,
} from "../_actions";

const initialState: ForgotPasswordActionState = { submitted: false };

export function ForgotPasswordForm() {
  const [state, action] = useActionState(
    forgotCustomerPasswordAction,
    initialState
  );
  const t = useTranslations("CustomerAccount");

  return (
    <form action={action} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="forgot-password-email">{t("email")}</Label>
        <Input
          id="forgot-password-email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      {state.message && (
        <p role="alert" className="text-sm text-destructive">
          {t(state.message)}
        </p>
      )}
      {state.submitted && (
        <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {t("forgotPasswordNeutralSuccess")}
        </p>
      )}
      <SubmitButton />
      <TenantLink
        href="/account/login"
        className="block min-h-11 rounded-lg px-3 py-2 text-center text-sm font-medium text-muted-foreground hover:bg-muted"
      >
        {t("backToSignIn")}
      </TenantLink>
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("CustomerAccount");
  return (
    <Button className="min-h-11 w-full" type="submit" disabled={pending}>
      {pending ? t("sendingResetLink") : t("sendResetLink")}
    </Button>
  );
}
