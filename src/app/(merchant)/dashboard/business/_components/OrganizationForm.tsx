"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { OrganizationProfile } from "@/lib/merchant-organizations/core";
import {
  createOrganizationAction,
  updateOrganizationAction,
  type OrganizationActionState,
} from "../_actions";

const initialState: OrganizationActionState = { success: false };

const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring";
const buttonClass =
  "min-h-11 rounded-lg bg-foreground px-5 py-2 font-semibold text-background disabled:cursor-not-allowed disabled:opacity-60";

export function OrganizationForm({
  mode,
  initialValues,
}: {
  mode: "create" | "edit";
  initialValues?: Partial<OrganizationProfile>;
}) {
  const t = useTranslations("MerchantOrganization");
  const action =
    mode === "create" ? createOrganizationAction : updateOrganizationAction;
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <Field
        id="organization-display-name"
        name="displayName"
        label={t("businessName")}
        required
        maxLength={160}
        defaultValue={initialValues?.displayName ?? ""}
        error={state.errors?.displayName?.[0]}
      />
      <Field
        id="organization-legal-name"
        name="legalName"
        label={t("legalName")}
        maxLength={200}
        defaultValue={initialValues?.legalName ?? ""}
        error={state.errors?.legalName?.[0]}
      />
      <Field
        id="organization-business-number"
        name="businessNumber"
        label={t("businessNumber")}
        maxLength={64}
        defaultValue={initialValues?.businessNumber ?? ""}
        error={state.errors?.businessNumber?.[0]}
      />
      <Field
        id="organization-vat-number"
        name="vatNumber"
        label={t("vatNumber")}
        maxLength={64}
        defaultValue={initialValues?.vatNumber ?? ""}
        error={state.errors?.vatNumber?.[0]}
      />
      <Field
        id="organization-email"
        name="email"
        type="email"
        label={t("email")}
        maxLength={320}
        defaultValue={initialValues?.email ?? ""}
        error={state.errors?.email?.[0]}
      />
      <Field
        id="organization-phone"
        name="phone"
        type="tel"
        label={t("phone")}
        maxLength={64}
        defaultValue={initialValues?.phone ?? ""}
        error={state.errors?.phone?.[0]}
      />
      <Field
        id="organization-country"
        name="country"
        label={t("country")}
        required
        minLength={2}
        maxLength={2}
        defaultValue={initialValues?.country ?? "IL"}
        error={state.errors?.country?.[0]}
      />

      {state.message ? (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {t(state.message)}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className={buttonClass}>
        {pending
          ? t(mode === "create" ? "creatingBusiness" : "savingBusiness")
          : t(mode === "create" ? "createBusiness" : "saveBusiness")}
      </button>
    </form>
  );
}

function Field({
  id,
  name,
  label,
  type = "text",
  required = false,
  minLength,
  maxLength,
  defaultValue,
  error,
}: {
  id: string;
  name:
    | "displayName"
    | "legalName"
    | "businessNumber"
    | "vatNumber"
    | "email"
    | "phone"
    | "country";
  label: string;
  type?: "text" | "email" | "tel";
  required?: boolean;
  minLength?: number;
  maxLength: number;
  defaultValue: string;
  error?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        defaultValue={defaultValue}
        className={inputClass}
      />
      {error ? (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
