import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { ManagementInput } from "@/components/management/ManagementInput";
import { ManagementSelect } from "@/components/management/ManagementSelect";
import { ManagementTextarea } from "@/components/management/ManagementTextarea";
import { ManagementMutationForm } from "@/components/management/ManagementMutation";
import { getControlPlaneStore } from "@/lib/control-plane/server";
import { getCustomDomainAdminSummary } from "@/lib/custom-domain-lifecycle/server";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { MetricCard } from "../../_components/MetricCard";
import { StoreStatusBadge } from "../../_components/StoreStatusBadge";
import {
  rollbackCustomDomainAction,
  updateStoreAction,
} from "../../_actions/stores";

export const dynamic = "force-dynamic";

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const [{ slug }, t] = await Promise.all([
    params,
    getTranslations("ControlPlane"),
  ]);

  const [store, domainSummary] = await Promise.all([
    getControlPlaneStore(slug),
    getCustomDomainAdminSummary(slug),
  ]);

  if (!store) notFound();

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/admin/stores"
            className="text-sm text-indigo-700 hover:underline"
          >
            ← {t("stores")}
          </Link>
          <h1 className="mt-2 text-3xl font-bold">
            {store.displayName}
          </h1>
          <p className="font-mono text-sm text-slate-500">
            {store.slug}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StoreStatusBadge
            status={store.status}
            label={t(store.status)}
          />
          <Button asChild variant="outline" size="management">
            <a href={`/${store.slug}/admin`}>
              {t("openTenantAdmin")}
            </a>
          </Button>
        </div>
      </header>


      {store.kind === "available" ? (
        <section className="grid gap-4 sm:grid-cols-3">
          <MetricCard
            label={t("orders")}
            value={formatNumber(store.metrics.orderCount)}
          />
          <MetricCard
            label={t("sales")}
            value={formatCurrency(store.metrics.salesVolume)}
          />
          <MetricCard
            label={t("lastActivity")}
            value={
              store.metrics.lastActivity
                ? new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  }).format(store.metrics.lastActivity)
                : t("noActivity")
            }
          />
        </section>
      ) : (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950"
        >
          {t("storeMetricsUnavailable")}
        </div>
      )}

      {(domainSummary?.primary || domainSummary?.retiring) ? (
        <section className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">
            {t("customDomainLifecycle")}
          </h2>

          {domainSummary.primary ? (
            <p className="mt-3 text-sm">
              {t("customDomainPrimary")}:{" "}
              <span className="font-mono">
                {domainSummary.primary.hostname}
              </span>
            </p>
          ) : null}

          {domainSummary.retiring ? (
            <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4">
              <p className="text-sm">
                {t("customDomainRetiring")}:{" "}
                <span className="font-mono">
                  {domainSummary.retiring.hostname}
                </span>
              </p>
              <p className="mt-1 text-sm">
                {t("customDomainRetireAt")}:{" "}
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(domainSummary.retiring.retireAt)}
              </p>
              <p className="mt-2 text-sm text-amber-950">
                {t("customDomainRollbackHelp")}
              </p>
              <ManagementMutationForm
                action={rollbackCustomDomainAction}
                successMessage={t("domainRollbackComplete")}
                failureMessage={t("domainRollbackFailed")}
                className="mt-4"
              >
                <input
                  type="hidden"
                  name="tenantSlug"
                  value={store.slug}
                />
                <input
                  type="hidden"
                  name="restoreHostname"
                  value={domainSummary.retiring.hostname}
                />
                <Button type="submit" size="management" className="px-5">
                  {t("customDomainRollback")}
                </Button>
              </ManagementMutationForm>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <ManagementMutationForm
          action={updateStoreAction}
          successMessage={t("storeSaved")}
          failureMessage={t("storeSaveFailed")}
          className="space-y-5 rounded-xl border bg-white p-6 shadow-sm"
        >
          <input type="hidden" name="slug" value={store.slug} />
          <h2 className="text-xl font-bold">{t("storeSettings")}</h2>
          <label className="grid gap-2">
            <span className="text-sm font-medium">{t("status")}</span>
            <ManagementSelect
              name="status"
              defaultValue={store.status}
            >
              <option value="active">{t("active")}</option>
              <option value="suspended">{t("suspended")}</option>
              <option value="disabled">{t("disabled")}</option>
            </ManagementSelect>
          </label>
          <label className="flex items-center gap-2">
            <input
              name="featured"
              type="checkbox"
              defaultChecked={store.featured}
            />
            <span className="text-sm font-medium">
              {t("featureStore")}
            </span>
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">
              {t("featuredRank")}
            </span>
            <ManagementInput
              name="featuredRank"
              type="number"
              min="1"
              defaultValue={store.featuredRank ?? ""}
            />
          </label>
          <label className="grid gap-2">
            <span className="text-sm font-medium">
              {t("supportNotes")}
            </span>
            <ManagementTextarea
              name="supportNotes"
              maxLength={4000}
              defaultValue={store.supportNotes ?? ""}
              rows={5}
              placeholder={t("supportNotesPlaceholder")}
            />
          </label>
          <Button type="submit" size="management" className="px-5">
            {t("saveChanges")}
          </Button>
        </ManagementMutationForm>

        <aside className="space-y-3 rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="font-bold">{t("storeIdentity")}</h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">{t("schema")}</dt>
              <dd className="font-mono">{store.schemaName}</dd>
            </div>
            <div>
              <dt className="text-slate-500">{t("created")}</dt>
              <dd>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "long",
                }).format(store.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">{t("updated")}</dt>
              <dd>
                {new Intl.DateTimeFormat(undefined, {
                  dateStyle: "long",
                  timeStyle: "short",
                }).format(store.updatedAt)}
              </dd>
            </div>
          </dl>
        </aside>
      </section>
    </div>
  );
}
