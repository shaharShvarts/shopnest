"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resetCustomerPasswordAction,
  type ResetPasswordActionState,
} from "../_actions";

const initialState: ResetPasswordActionState = { success: false };

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(
    resetCustomerPasswordAction,
    initialState
  );
  const t = useTranslations("CustomerAccount");

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <PasswordField
        id="reset-password"
        name="password"
        label={t("newPassword")}
      />
      <PasswordField
        id="reset-password-confirmation"
        name="passwordConfirmation"
        label={t("confirmPassword")}
      />
      <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
      {state.message && (
        <p role="alert" className="text-sm text-destructive">
          {t(state.message)}
        </p>
      )}
      <SubmitButton />
    </form>
  );
}

function PasswordField({
  id,
  name,
  label,
}: {
  id: string;
  name: string;
  label: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={name}
        type="password"
        autoComplete="new-password"
        required
      />
    </div>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("CustomerAccount");
  return (
    <Button className="min-h-11 w-full" type="submit" disabled={pending}>
      {pending ? t("resettingPassword") : t("resetPassword")}
    </Button>
  );
}
