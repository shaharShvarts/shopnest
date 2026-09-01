"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TenantLink } from "@/components/TenantLink";
import {
  registerCustomerAction,
  type CustomerAuthActionState,
} from "../_actions";

const initialState: CustomerAuthActionState = { success: false };

export function CustomerRegisterForm({ callback }: { callback: string }) {
  const [state, action] = useActionState(registerCustomerAction, initialState);
  const t = useTranslations("CustomerAccount");
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="callback" value={callback} />
      <AccountField id="register-name" name="name" label={t("name")} autoComplete="name" errors={state.errors?.name} />
      <AccountField id="register-email" name="email" label={t("email")} type="email" autoComplete="email" errors={state.errors?.email} />
      <AccountField id="register-password" name="password" label={t("password")} type="password" autoComplete="new-password" errors={state.errors?.password} />
      <AccountField id="register-password-confirmation" name="passwordConfirmation" label={t("confirmPassword")} type="password" autoComplete="new-password" errors={state.errors?.passwordConfirmation} />
      <p className="text-xs text-muted-foreground">{t("passwordHint")}</p>
      {state.message && <p role="alert" className="text-sm text-destructive">{t(state.message)}</p>}
      <RegisterButton />
      <TenantLink href={callback} className="block min-h-11 rounded-lg px-3 py-2 text-center text-sm font-medium text-muted-foreground hover:bg-muted">
        {t("continueAsGuest")}
      </TenantLink>
      <p className="text-center text-sm text-muted-foreground">
        {t("hasAccount")} {" "}
        <TenantLink href={`/account/login?callback=${encodeURIComponent(callback)}`} className="font-medium text-foreground underline underline-offset-4">
          {t("signIn")}
        </TenantLink>
      </p>
    </form>
  );
}

function AccountField({ id, name, label, type = "text", autoComplete, errors }: { id: string; name: string; label: string; type?: string; autoComplete: string; errors?: string[] }) {
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} name={name} type={type} autoComplete={autoComplete} required />{errors?.length ? <p className="text-sm text-destructive">{errors.join(" ")}</p> : null}</div>;
}

function RegisterButton() {
  const { pending } = useFormStatus();
  const t = useTranslations("CustomerAccount");
  return <Button className="min-h-11 w-full" type="submit" disabled={pending}>{pending ? t("creatingAccount") : t("createAccount")}</Button>;
}
