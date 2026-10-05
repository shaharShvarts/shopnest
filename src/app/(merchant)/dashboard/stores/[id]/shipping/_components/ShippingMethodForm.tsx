"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ManagementInput } from "@/components/management/ManagementInput";
import type { ShippingMethod } from "@/lib/shipping/core";
import { ManagedImageUpload } from "../../_components/ManagedImageUpload";

const initialState = { success: false, errors: {} as Record<string, string[]> };

export function ShippingMethodForm({
  action,
  tenantSlug,
  method,
}: {
  action: (
    previousState: typeof initialState,
    formData: FormData
  ) => Promise<typeof initialState>;
  tenantSlug: string;
  method?: ShippingMethod;
}) {
  const t = useTranslations("StoreShippingManagement");
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-8">
      {state.errors?._form?.map((message) => (
        <p
          key={message}
          role="alert"
          className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {message}
        </p>
      ))}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
        <div className="space-y-6">
          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-semibold">
              {t("name")}
            </label>
            <ManagementInput
              id="name"
              name="name"
              required
              maxLength={120}
              autoFocus
              defaultValue={method?.name ?? ""}
            />
            {state.errors?.name?.map((message) => (
              <p key={message} className="mt-2 text-sm text-destructive">
                {message}
              </p>
            ))}
          </div>

          <div>
            <label htmlFor="price" className="mb-2 block text-sm font-semibold">
              {t("price")}
            </label>
            <ManagementInput
              id="price"
              name="price"
              type="number"
              min="0"
              step="1"
              required
              defaultValue={method?.price ?? 0}
            />
            {state.errors?.price?.map((message) => (
              <p key={message} className="mt-2 text-sm text-destructive">
                {message}
              </p>
            ))}
          </div>

          <label className="flex min-h-11 items-center gap-3">
            <input
              name="requiresAddress"
              type="checkbox"
              defaultChecked={method?.requiresAddress ?? true}
              className="size-4"
            />
            <span>{t("requiresAddress")}</span>
          </label>

          <Button
            type="submit"
            size="management"
            disabled={pending}
            className="px-6"
          >
            {pending ? t("saving") : t("save")}
          </Button>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold">{t("logo")}</p>
          <ManagedImageUpload
            tenantSlug={tenantSlug}
            initialImage={method?.logoUrl}
            name="logo"
            required={false}
          />
          {state.errors?.logo?.map((message) => (
            <p key={message} className="text-sm text-destructive">
              {message}
            </p>
          ))}
        </div>
      </div>
    </form>
  );
}
