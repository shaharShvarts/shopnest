"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  suggestStoreSlug,
  validateStoreSlug,
} from "@/lib/merchant-stores/core";
import {
  checkStoreSlugAvailabilityAction,
  createStoreAction,
  updateStoreAction,
  type StoreFormActionState,
} from "../_actions";

const initialState: StoreFormActionState = { success: false };

const inputClass =
  "min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring";
const buttonClass =
  "min-h-11 rounded-lg bg-foreground px-5 py-2 font-semibold text-background disabled:cursor-not-allowed disabled:opacity-60";

type StoreFormValues = {
  id?: number;
  displayName?: string;
  slug?: string;
  tenantId?: number | null;
  updatedAt?: string;
};

type Availability =
  | "idle"
  | "checking"
  | "available"
  | "unavailable"
  | "invalid"
  | "reserved";

export function StoreForm({
  mode,
  initialValues,
}: {
  mode: "create" | "edit";
  initialValues?: StoreFormValues;
}) {
  const t = useTranslations("MerchantStore");
  const action =
    mode === "create" ? createStoreAction : updateStoreAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const [displayName, setDisplayName] = useState(
    initialValues?.displayName ?? ""
  );
  const [slug, setSlug] = useState(initialValues?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(false);
  const [availability, setAvailability] =
    useState<Availability>("idle");
  const slugLocked =
    mode === "edit" && initialValues?.tenantId !== null;

  useEffect(() => {
    if (slugLocked) {
      setAvailability("idle");
      return;
    }

    const validation = validateStoreSlug(slug);
    if (!validation.ok) {
      setAvailability(validation.reason);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setAvailability("checking");

      void checkStoreSlugAvailabilityAction({
        slug: validation.slug,
        currentStoreId:
          mode === "edit" ? initialValues?.id : undefined,
      }).then((result) => {
        if (cancelled) return;

        if (
          result.reason === "invalid" ||
          result.reason === "reserved"
        ) {
          setAvailability(result.reason);
          return;
        }

        setAvailability(
          result.available ? "available" : "unavailable"
        );
      });
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    slug,
    slugLocked,
    mode,
    initialValues?.id,
  ]);

  function handleDisplayNameChange(value: string) {
    setDisplayName(value);
    if (!slugEdited && !slugLocked) {
      setSlug(suggestStoreSlug(value));
    }
  }

  function handleSlugChange(value: string) {
    setSlugEdited(true);
    setSlug(value.toLowerCase());
  }

  const availabilityMessage =
    availability === "checking"
      ? t("checkingSlug")
      : availability === "available"
        ? t("slugAvailable")
        : availability === "unavailable"
          ? t("slugUnavailable")
          : availability === "reserved"
            ? t("slugReserved")
            : availability === "invalid" && slug
              ? t("slugInvalid")
              : "";

  return (
    <form action={formAction} className="space-y-5">
      {mode === "edit" ? (
        <>
          <input
            type="hidden"
            name="storeId"
            value={initialValues?.id ?? ""}
          />
          <input
            type="hidden"
            name="expectedUpdatedAt"
            value={initialValues?.updatedAt ?? ""}
          />
        </>
      ) : null}

      <div>
        <label
          htmlFor="store-display-name"
          className="mb-1 block text-sm font-medium"
        >
          {t("storeName")}
        </label>
        <input
          id="store-display-name"
          name="displayName"
          required
          maxLength={160}
          value={displayName}
          onChange={(event) =>
            handleDisplayNameChange(event.target.value)
          }
          className={inputClass}
        />
        {state.errors?.displayName?.[0] ? (
          <p className="mt-1 text-xs text-destructive">
            {t("invalidStoreDetails")}
          </p>
        ) : null}
      </div>

      <div>
        <label
          htmlFor="store-slug"
          className="mb-1 block text-sm font-medium"
        >
          {t("slug")}
        </label>
        <input
          id="store-slug"
          name="slug"
          required
          maxLength={63}
          value={slug}
          onChange={(event) =>
            handleSlugChange(event.target.value)
          }
          readOnly={slugLocked}
          className={inputClass}
        />
        {!slugLocked && !slug && displayName ? (
          <p className="mt-1 text-xs text-muted-foreground">
            {t("slugManualRequired")}
          </p>
        ) : null}
        {slugLocked ? (
          <p className="mt-2 text-sm text-muted-foreground">
            {t("slugLocked")}
          </p>
        ) : null}
        {availabilityMessage ? (
          <p
            aria-live="polite"
            className="mt-2 text-sm text-muted-foreground"
          >
            {availabilityMessage}
          </p>
        ) : null}
      </div>

      <div className="rounded-xl bg-muted px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("futureUrl")}
        </p>
        <p className="mt-1 break-all font-mono text-sm">
          shopnest.co.il/{slug || "your-store"}
        </p>
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
        className={buttonClass}
      >
        {pending
          ? t(
              mode === "create"
                ? "creatingStore"
                : "savingStore"
            )
          : t(mode === "create" ? "createStore" : "saveStore")}
      </button>
    </form>
  );
}
