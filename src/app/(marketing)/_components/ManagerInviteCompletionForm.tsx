"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  completeManagerInviteAction,
  type CompleteManagerInviteActionState,
} from "../_actions/store-manager-invite";

const initialState: CompleteManagerInviteActionState = { success: false };

const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ManagerInviteCompletionForm({
  token,
}: {
  token: string;
}) {
  const t = useTranslations("StoreManagerInvite");
  const [state, action, pending] = useActionState(
    completeManagerInviteAction,
    initialState
  );

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="token" value={token} />

      <div>
        <label
          htmlFor="manager-invite-password"
          className="mb-1 block text-sm font-medium"
        >
          {t("password")}
        </label>
        <input
          id="manager-invite-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={256}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {t("passwordHelp")}
        </p>
      </div>

      <div>
        <label
          htmlFor="manager-invite-password-confirmation"
          className="mb-1 block text-sm font-medium"
        >
          {t("confirmPassword")}
        </label>
        <input
          id="manager-invite-password-confirmation"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          maxLength={256}
          className={inputClass}
        />
      </div>

      {state.message ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {t(state.message)}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 w-full rounded-lg bg-foreground px-4 py-2 font-semibold text-background disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? t("completing") : t("complete")}
      </button>
    </form>
  );
}
