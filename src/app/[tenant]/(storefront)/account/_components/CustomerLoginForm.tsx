"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TenantLink } from "@/components/TenantLink";
import {
  loginCustomerAction,
  type CustomerAuthActionState,
} from "../_actions";

const initialState: CustomerAuthActionState = { success: false };

export function CustomerLoginForm({ callback }: { callback: string }) {
  const [state, action] = useActionState(loginCustomerAction, initialState);
  const t = useTranslations("CustomerAccount");
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="callback" value={callback} />
      <div className="space-y-2">
        <Label htmlFor="customer-email">{t("email")}</Label>
        <Input id="customer-email" name="email" type="email" autoComplete="email" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="customer-password">{t("password")}</Label>
        <Input id="customer-password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <div className="flex items-center justify-between gap-4">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
          <input
            id="customer-remember-me"
            name="rememberMe"
            type="checkbox"
            value="true"
            className="size-4 rounded border-input accent-primary"
          />
          <span>{t("rememberMe")}</span>
        </label>
        <TenantLink
          href="/forgot-password"
          className="text-sm font-medium text-foreground underline underline-offset-4"
        >
          {t("forgotPassword")}
        </TenantLink>
      </div>
      {state.message && <p role="alert" className="text-sm text-destructive">{t(state.message)}</p>}
      <SubmitButton label={t("signIn")} pendingLabel={t("signingIn")} />
      <TenantLink href={callback} className="block min-h-11 rounded-lg px-3 py-2 text-center text-sm font-medium text-muted-foreground hover:bg-muted">
        {t("continueAsGuest")}
      </TenantLink>
      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")} {" "}
        <TenantLink href={`/account/register?callback=${encodeURIComponent(callback)}`} className="font-medium text-foreground underline underline-offset-4">
          {t("createAccount")}
        </TenantLink>
      </p>
    </form>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return <Button className="min-h-11 w-full" type="submit" disabled={pending}>{pending ? pendingLabel : label}</Button>;
}
