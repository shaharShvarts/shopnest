"use client";
import { useActionState, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SettingsReadModel } from "@/lib/payments/settings";
import type {
  PaymentEnvironment,
  ProviderMetadata,
} from "@/lib/payments/types";
import { savePaymentSettings, type PaymentSettingsState } from "./actions";

export function PaymentSettingsForm({
  settings,
  providers,
}: {
  settings: SettingsReadModel;
  providers: ProviderMetadata[];
}) {
  const t = useTranslations("Payments");
  const [providerId, setProvider] = useState(
    settings?.provider ?? providers[0].id,
  );
  const provider = providers.find((entry) => entry.id === providerId)!;
  const [environment, setEnvironment] = useState<PaymentEnvironment>(
    settings?.environment ?? provider.environments[0],
  );
  const sameConfiguration =
    settings?.provider === providerId && settings.environment === environment;
  const [state, action, pending] = useActionState<
    PaymentSettingsState,
    FormData
  >(
    async (_previous, form) => {
      return savePaymentSettings(_previous, {
        provider: providerId,
        environment,
        enabled: form.get("enabled") === "on",
        credentials: Object.fromEntries(
          provider.fields.map((field) => [
            field.id,
            String(form.get(field.id) ?? ""),
          ]),
        ),
      });
    },
    { success: false, message: "" },
  );
  return (
    <form
      action={action}
      className="max-w-2xl space-y-5 rounded-xl border p-4 sm:p-6"
    >
      <fieldset disabled={pending} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="provider">{t("provider")}</Label>
            <select
              id="provider"
              value={providerId}
              className="min-h-11 w-full rounded-md border bg-background px-3"
              onChange={(event) => {
                const next = providers.find(
                  (entry) => entry.id === event.target.value,
                )!;
                setProvider(next.id);
                setEnvironment(next.environments[0]);
              }}
            >
              {providers.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.displayName}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="environment">{t("environment")}</Label>
            <select
              id="environment"
              value={environment}
              onChange={(event) =>
                setEnvironment(event.target.value as PaymentEnvironment)
              }
              className="min-h-11 w-full rounded-md border bg-background px-3"
            >
              {provider.environments.map((value) => (
                <option key={value} value={value}>
                  {t(value)}
                </option>
              ))}
            </select>
          </div>
        </div>
        {!provider.live && (
          <p role="note" className="rounded-lg bg-muted p-3 text-sm">
            {t("notLive")}
          </p>
        )}
        <div
          key={`${providerId}:${environment}:${state.success}`}
          className="space-y-4"
        >
          {provider.fields.map((field) => (
            <div key={field.id} className="space-y-2">
              <Label htmlFor={field.id}>{t(`fields.${field.label}`)}</Label>
              <Input
                id={field.id}
                name={field.id}
                type={field.type}
                maxLength={field.maxLength}
                autoComplete={field.type === "password" ? "new-password" : "off"}
                required={
                  !(
                    sameConfiguration &&
                    settings.configuredFields.includes(field.id)
                  )
                }
                defaultValue=""
                aria-describedby={`${field.id}-hint`}
              />
              <p
                id={`${field.id}-hint`}
                className="text-sm text-muted-foreground"
              >
                {sameConfiguration &&
                settings.configuredFields.includes(field.id)
                  ? t("configured")
                  : t("notConfigured")}
              </p>
            </div>
          ))}
          {!provider.fields.length && (
            <p className="text-sm">{t("credentialsPending")}</p>
          )}
          <label className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              name="enabled"
              disabled={!provider.live}
              defaultChecked={Boolean(
                sameConfiguration && settings.enabled && provider.live,
              )}
            />
            {t("enabled")}
          </label>
        </div>
        <p className="text-sm text-muted-foreground">{t("testUnsupported")}</p>
        <Button type="submit">{pending ? t("saving") : t("save")}</Button>
      </fieldset>
      {state.message && (
        <p
          role="status"
          className={state.success ? "text-green-700" : "text-destructive"}
        >
          {t(state.message)}
        </p>
      )}
    </form>
  );
}
