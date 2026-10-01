import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import {
  addPlanEntitlementAction,
  createPlanAction,
  removePlanEntitlementAction,
  updatePlanAction,
} from "@/app/admin/_actions/plans";
import { formatMinorAmount } from "@/lib/plan-administration/core";
import { listPlanAdministration } from "@/lib/plan-administration/server";
import EntitlementIntegerInput from "./EntitlementIntegerInput";
import PlanPriceInput from "./PlanPriceInput";
import PlanFlashMessage from "./PlanFlashMessage";

export const dynamic = "force-dynamic";

const PLAN_RESULTS = new Set([
  "PLAN_CREATE_FAILED",
  "PLAN_CREATED",
  "ENTITLEMENT_ADD_FAILED",
  "ENTITLEMENT_ADDED",
  "ENTITLEMENT_REMOVE_FAILED",
  "ENTITLEMENT_REMOVED",
  "PLAN_UPDATE_FAILED",
  "PLAN_UPDATED",
]);

export default async function PlansPage() {
  const [plans, t, cookieStore] = await Promise.all([
    listPlanAdministration(),
    getTranslations("ControlPlane"),
    cookies(),
  ]);
  const rawResult = cookieStore.get("SHOPNEST_PLAN_RESULT")?.value;
  const result = rawResult && PLAN_RESULTS.has(rawResult) ? rawResult : null;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">{t("plans")}</h1>
        <p className="mt-2 text-slate-600">
          {t("plansConfigurationDescription")}
        </p>
      </header>

      {result ? (
        <PlanFlashMessage message={t(`planResult.${result}`)} />
      ) : null}

      <section className="space-y-5">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
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
                  className="h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm transition-colors hover:border-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
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
                    type="text"
                    required
                    minLength={1}
                    maxLength={160}
                    defaultValue={plan.name}
                    className="h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm transition-colors hover:border-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-sm font-medium">
                    {t("monthlyPriceIls")}
                  </span>
                  <PlanPriceInput
                    name="monthlyPrice"
                    initialValue={formatMinorAmount(plan.prices.monthly)}
                  />
                </label>

                <label className="space-y-1">
                  <span className="text-sm font-medium">
                    {t("annualPriceIls")}
                  </span>
                  <PlanPriceInput
                    name="annualPrice"
                    initialValue={formatMinorAmount(plan.prices.annual)}
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
                        className="grid items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition-colors hover:border-slate-300 hover:bg-slate-50 md:grid-cols-[1fr_220px_auto]"
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

                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          formAction={removePlanEntitlementAction.bind(
                            null,
                            plan.id,
                            entitlement.id
                          )}
                          formNoValidate
                          className="h-9 self-center border-red-200 px-3 text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800"
                        >
                          {t("removeFeature")}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button
                type="submit"
                className="mt-6 h-11 bg-slate-900 px-5 text-white shadow-sm hover:bg-slate-800"
              >
                {t("savePlanConfiguration")}
              </Button>
            </form>

            {plan.availableEntitlements.length > 0 ? (
              <form
                action={addPlanEntitlementAction}
                className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/40 p-4 md:flex-row"
              >
                <input type="hidden" name="planId" value={plan.id} />
                <select
                  name="entitlementCode"
                  required
                  defaultValue=""
                  className="h-11 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm transition-colors hover:border-slate-400 focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200"
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
                <Button
                  type="submit"
                  variant="outline"
                  className="h-11 px-5 hover:bg-slate-50"
                >
                  + {t("addFeature")}
                </Button>
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
            type="text"
            required
            minLength={1}
            maxLength={64}
            pattern="[a-z0-9][a-z0-9_-]*"
            placeholder={t("planCode")}
            className="min-h-11 rounded-md border px-3 py-2"
          />
          <input
            name="name"
            type="text"
            required
            minLength={1}
            maxLength={160}
            placeholder={t("planName")}
            className="min-h-11 rounded-md border px-3 py-2"
          />
          <Button
            type="submit"
            className="h-11 bg-slate-900 px-4 text-white shadow-sm hover:bg-slate-800 md:col-span-2"
          >
            {t("createPlan")}
          </Button>
        </form>
      </section>
    </div>
  );
}
