import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import {
  addPlanEntitlementAction,
  createPlanAction,
  updatePlanAction,
} from "@/app/admin/_actions/plans";
import { formatMinorAmount } from "@/lib/plan-administration/core";
import { listPlanAdministration } from "@/lib/plan-administration/server";
import EntitlementIntegerInput from "./EntitlementIntegerInput";
import PlanPriceInput from "./PlanPriceInput";
import { ManagementInput } from "@/components/management/ManagementInput";
import { ManagementSelect } from "@/components/management/ManagementSelect";
import {
  ManagementMutationButton,
  ManagementMutationForm,
} from "@/components/management/ManagementMutation";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const [plans, t] = await Promise.all([
    listPlanAdministration(),
    getTranslations("ControlPlane"),
  ]);

  const planMessages = {
    PLAN_CREATE_FAILED: t("planResult.PLAN_CREATE_FAILED"),
    PLAN_CREATED: t("planResult.PLAN_CREATED"),
    ENTITLEMENT_ADD_FAILED: t("planResult.ENTITLEMENT_ADD_FAILED"),
    ENTITLEMENT_ADDED: t("planResult.ENTITLEMENT_ADDED"),
    ENTITLEMENT_REMOVE_FAILED: t("planResult.ENTITLEMENT_REMOVE_FAILED"),
    ENTITLEMENT_REMOVED: t("planResult.ENTITLEMENT_REMOVED"),
    PLAN_UPDATE_FAILED: t("planResult.PLAN_UPDATE_FAILED"),
    PLAN_UPDATED: t("planResult.PLAN_UPDATED"),
  };

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold">{t("plans")}</h1>
        <p className="mt-2 text-slate-600">
          {t("plansConfigurationDescription")}
        </p>
      </header>

      <section className="space-y-5">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
          >
            <ManagementMutationForm action={updatePlanAction} messages={planMessages}>
              <input type="hidden" name="planId" value={plan.id} />

              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-sm text-slate-500">{plan.code}</p>
                  <h2 className="text-2xl font-bold">{plan.name}</h2>
                </div>
                <ManagementSelect
                  name="status"
                  defaultValue={plan.status}
                  wrapperClassName="min-w-28"
                >
                  <option value="active">{t("active")}</option>
                  <option value="inactive">{t("inactive")}</option>
                </ManagementSelect>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <label className="space-y-1">
                  <span className="text-sm font-medium">{t("planName")}</span>
                  <ManagementInput
                    name="name"
                    type="text"
                    required
                    minLength={1}
                    maxLength={160}
                    defaultValue={plan.name}
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
                        className="grid items-center gap-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4 transition-colors hover:border-slate-300 hover:bg-slate-50 md:grid-cols-[minmax(0,1fr)_minmax(220px,max-content)_auto]"
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
                          <ManagementSelect
                            name={`entitlement_${entitlement.id}`}
                            defaultValue={String(entitlement.value)}
                          >
                            <option value="0">{t("disabled")}</option>
                            <option value="1">{t("enabled")}</option>
                          </ManagementSelect>
                        ) : (
                          <EntitlementIntegerInput
                            name={`entitlement_${entitlement.id}`}
                            initialValue={entitlement.value ?? 0}
                            unlimitedLabel={t("unlimited")}
                          />
                        )}

                        <ManagementMutationButton
                          action={removePlanEntitlementAction.bind(
                            null,
                            plan.id,
                            entitlement.id
                          )}
                          label={t("removeFeature")}
                          messages={planMessages}
                          failureMessage={t("planResult.ENTITLEMENT_REMOVE_FAILED")}
                          className="border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Button
                type="submit"
                size="management"
                className="mt-6 bg-slate-900 px-5 text-white shadow-sm hover:bg-slate-800"
              >
                {t("savePlanConfiguration")}
              </Button>
            </ManagementMutationForm>

            {plan.availableEntitlements.length > 0 ? (
              <ManagementMutationForm
                action={addPlanEntitlementAction}
                messages={planMessages}
                resetOnSuccess
                className="mt-4 flex flex-col gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/40 p-4 md:flex-row"
              >
                <input type="hidden" name="planId" value={plan.id} />
                <ManagementSelect
                  name="entitlementCode"
                  required
                  defaultValue=""
                  wrapperClassName="flex-1"
                >
                  <option value="" disabled>
                    {t("chooseFeature")}
                  </option>
                  {plan.availableEntitlements.map((entitlement) => (
                    <option key={entitlement.code} value={entitlement.code}>
                      {t(`entitlements.${entitlement.code}.name`)}
                    </option>
                  ))}
                </ManagementSelect>
                <Button
                  type="submit"
                  variant="outline"
                  size="management"
                  className="px-5 hover:bg-slate-50"
                >
                  + {t("addFeature")}
                </Button>
              </ManagementMutationForm>
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
        <ManagementMutationForm
          action={createPlanAction}
          messages={planMessages}
          resetOnSuccess
          className="mt-5 grid gap-3 md:grid-cols-2"
        >
          <ManagementInput
            name="code"
            type="text"
            required
            minLength={1}
            maxLength={64}
            pattern="[a-z0-9][a-z0-9_-]*"
            placeholder={t("planCode")}
          />
          <ManagementInput
            name="name"
            type="text"
            required
            minLength={1}
            maxLength={160}
            placeholder={t("planName")}
          />
          <Button
            type="submit"
            size="management"
            className="bg-slate-900 px-4 text-white shadow-sm hover:bg-slate-800 md:col-span-2"
          >
            {t("createPlan")}
          </Button>
        </ManagementMutationForm>
      </section>
    </div>
  );
}
