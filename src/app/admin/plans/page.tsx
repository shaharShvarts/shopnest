import { getTranslations } from "next-intl/server";
import {
  addPlanEntitlementAction,
  createPlanAction,
  removePlanEntitlementAction,
  updatePlanAction,
} from "@/app/admin/_actions/plans";
import { formatMinorAmount } from "@/lib/plan-administration/core";
import { listPlanAdministration } from "@/lib/plan-administration/server";
import EntitlementIntegerInput from "./EntitlementIntegerInput";

export const dynamic = "force-dynamic";

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string }>;
}) {
  const [plans, t, query] = await Promise.all([
    listPlanAdministration(),
    getTranslations("ControlPlane"),
    searchParams,
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">{t("plans")}</h1>
        <p className="mt-2 text-slate-600">
          {t("plansConfigurationDescription")}
        </p>
      </header>

      {query.result ? (
        <p className="rounded-lg border bg-white px-4 py-3 text-sm shadow-sm">
          {t(`planResult.${query.result}`)}
        </p>
      ) : null}

      <section className="space-y-5">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className="rounded-xl border bg-white p-6 shadow-sm"
          >
            <form action={updatePlanAction}>
              <input type="hidden" name="planId" value={plan.id} />

              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-sm text-slate-500">{plan.code}</p>
                  <h2 className="text-2xl font-bold">{plan.name}</h2>
                </div>
                <select
                  name="status"
                  defaultValue={plan.status}
                  className="min-h-10 rounded-md border px-3 py-2"
                >
                  <option value="active">{t("active")}</option>
                  <option value="inactive">{t("inactive")}</option>
                </select>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t("planName")}</span>
                  <input
                    name="name"
                    required
                    defaultValue={plan.name}
                    className="min-h-11 w-full rounded-md border px-3 py-2"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-sm font-medium">
                    {t("monthlyPriceIls")}
                  </span>
                  <input
                    name="monthlyPrice"
                    inputMode="decimal"
                    defaultValue={formatMinorAmount(plan.prices.monthly)}
                    placeholder="0.00"
                    className="min-h-11 w-full rounded-md border px-3 py-2"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-sm font-medium">
                    {t("annualPriceIls")}
                  </span>
                  <input
                    name="annualPrice"
                    inputMode="decimal"
                    defaultValue={formatMinorAmount(plan.prices.annual)}
                    placeholder="0.00"
                    className="min-h-11 w-full rounded-md border px-3 py-2"
                  />
                </label>
              </div>

              <div className="mt-6">
                <h3 className="font-bold">{t("planEntitlements")}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {t("planEntitlementsHelp")}
                </p>

                {plan.entitlements.length === 0 ? (
                  <p className="mt-3 text-sm text-slate-500">
                    {t("noPlanEntitlements")}
                  </p>
                ) : (
                  <div className="mt-4 space-y-3">
                    {plan.entitlements.map((entitlement) => (
                      <div
                        key={entitlement.id}
                        className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_220px_auto]"
                      >
                        <div>
                          <p className="font-semibold">
                            {t(`entitlements.${entitlement.code}.name`)}
                          </p>
                          <p className="font-mono text-xs text-slate-500">
                            {entitlement.code}
                          </p>
                          <p className="mt-1 text-sm text-slate-600">
                            {t(`entitlements.${entitlement.code}.description`)}
                          </p>
                        </div>

                        {entitlement.valueType === "boolean" ? (
                          <select
                            name={`entitlement_${entitlement.id}`}
                            defaultValue={String(entitlement.value)}
                            className="min-h-11 rounded-md border px-3 py-2"
                          >
                            <option value="0">{t("disabled")}</option>
                            <option value="1">{t("enabled")}</option>
                          </select>
                        ) : (
                          <EntitlementIntegerInput
                            name={`entitlement_${entitlement.id}`}
                            initialValue={entitlement.value ?? 0}
                            unlimitedLabel={t("unlimited")}
                          />
                        )}

                        <button
                          type="submit"
                          formAction={removePlanEntitlementAction.bind(
                            null,
                            plan.id,
                            entitlement.id
                          )}
                          formNoValidate
                          className="min-h-11 rounded-md border border-red-200 px-4 py-2 font-semibold text-red-700"
                        >
                          {t("removeFeature")}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="mt-6 min-h-11 rounded-md bg-slate-950 px-5 py-2.5 font-semibold text-white"
              >
                {t("savePlanConfiguration")}
              </button>
            </form>

            {plan.availableEntitlements.length > 0 ? (
              <form
                action={addPlanEntitlementAction}
                className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed p-4 md:flex-row"
              >
                <input type="hidden" name="planId" value={plan.id} />
                <select
                  name="entitlementCode"
                  required
                  defaultValue=""
                  className="min-h-11 flex-1 rounded-md border px-3 py-2"
                >
                  <option value="" disabled>
                    {t("chooseFeature")}
                  </option>
                  {plan.availableEntitlements.map((entitlement) => (
                    <option key={entitlement.code} value={entitlement.code}>
                      {t(`entitlements.${entitlement.code}.name`)}
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="min-h-11 rounded-md border px-5 py-2.5 font-semibold"
                >
                  + {t("addFeature")}
                </button>
              </form>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                {t("allSupportedFeaturesAdded")}
              </p>
            )}
          </article>
        ))}
      </section>

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">{t("createPlan")}</h2>
        <p className="mt-2 text-sm text-slate-600">{t("createPlanHelp")}</p>
        <form action={createPlanAction} className="mt-5 grid gap-3 md:grid-cols-2">
          <input
            name="code"
            required
            placeholder={t("planCode")}
            className="min-h-11 rounded-md border px-3 py-2"
          />
          <input
            name="name"
            required
            placeholder={t("planName")}
            className="min-h-11 rounded-md border px-3 py-2"
          />
          <button
            type="submit"
            className="min-h-11 rounded-md bg-slate-950 px-4 py-2 font-semibold text-white md:col-span-2"
          >
            {t("createPlan")}
          </button>
        </form>
      </section>
    </div>
  );
}
