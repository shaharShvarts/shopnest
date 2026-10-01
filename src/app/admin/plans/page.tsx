import { getTranslations } from "next-intl/server";
import {
  createEntitlementAction,
  createPlanAction,
  updatePlanAction,
} from "@/app/admin/_actions/plans";
import { formatMinorAmount } from "@/lib/plan-administration/core";
import { listPlanAdministration } from "@/lib/plan-administration/server";

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

  const entitlements = plans[0]?.entitlements ?? [];

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

      <section className="rounded-xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold">{t("entitlementCatalog")}</h2>
        <p className="mt-2 text-sm text-slate-600">
          {t("entitlementCatalogDescription")}
        </p>

        {entitlements.length > 0 ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="px-3 py-2">{t("code")}</th>
                  <th className="px-3 py-2">{t("name")}</th>
                  <th className="px-3 py-2">{t("valueType")}</th>
                  <th className="px-3 py-2">{t("description")}</th>
                </tr>
              </thead>
              <tbody>
                {entitlements.map((entitlement) => (
                  <tr key={entitlement.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-mono">{entitlement.code}</td>
                    <td className="px-3 py-2">{entitlement.name}</td>
                    <td className="px-3 py-2">{t(entitlement.valueType)}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {entitlement.description ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">{t("noEntitlements")}</p>
        )}

        <form action={createEntitlementAction} className="mt-6 grid gap-3 md:grid-cols-2">
          <input
            name="code"
            required
            placeholder={t("entitlementCode")}
            className="min-h-11 rounded-md border px-3 py-2"
          />
          <input
            name="name"
            required
            placeholder={t("entitlementName")}
            className="min-h-11 rounded-md border px-3 py-2"
          />
          <select
            name="valueType"
            defaultValue="integer"
            className="min-h-11 rounded-md border px-3 py-2"
          >
            <option value="integer">{t("integer")}</option>
            <option value="boolean">{t("boolean")}</option>
          </select>
          <input
            name="description"
            placeholder={t("description")}
            className="min-h-11 rounded-md border px-3 py-2"
          />
          <button
            type="submit"
            className="min-h-11 rounded-md bg-slate-950 px-4 py-2 font-semibold text-white md:col-span-2"
          >
            {t("addEntitlement")}
          </button>
        </form>
      </section>

      <section className="space-y-5">
        {plans.map((plan) => (
          <form
            key={plan.id}
            action={updatePlanAction}
            className="rounded-xl border bg-white p-6 shadow-sm"
          >
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
                <span className="text-sm font-medium">{t("monthlyPriceIls")}</span>
                <input
                  name="monthlyPrice"
                  inputMode="decimal"
                  defaultValue={formatMinorAmount(plan.prices.monthly)}
                  placeholder="0.00"
                  className="min-h-11 w-full rounded-md border px-3 py-2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-sm font-medium">{t("annualPriceIls")}</span>
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
                  {t("noEntitlements")}
                </p>
              ) : (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {plan.entitlements.map((entitlement) => (
                    <label key={entitlement.id} className="space-y-1">
                      <span className="text-sm font-medium">
                        {entitlement.name}{" "}
                        <span className="font-mono text-xs text-slate-500">
                          ({entitlement.code})
                        </span>
                      </span>
                      {entitlement.valueType === "boolean" ? (
                        <select
                          name={`entitlement_${entitlement.id}`}
                          defaultValue={
                            entitlement.value === null
                              ? ""
                              : String(entitlement.value)
                          }
                          className="min-h-11 w-full rounded-md border px-3 py-2"
                        >
                          <option value="">{t("notConfigured")}</option>
                          <option value="0">{t("disabled")}</option>
                          <option value="1">{t("enabled")}</option>
                        </select>
                      ) : (
                        <input
                          name={`entitlement_${entitlement.id}`}
                          type="number"
                          min={-1}
                          step={1}
                          defaultValue={entitlement.value ?? ""}
                          placeholder={t("entitlementValuePlaceholder")}
                          className="min-h-11 w-full rounded-md border px-3 py-2"
                        />
                      )}
                    </label>
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
