import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { getControlPlaneStore } from "@/lib/control-plane/server";
import { MetricCard } from "../../_components/MetricCard";
import { StoreStatusBadge } from "../../_components/StoreStatusBadge";
import { updateStoreAction } from "../../_actions/stores";

export const dynamic = "force-dynamic";

export default async function StoreDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ saved?: string }> }) {
  const [{ slug }, query, t] = await Promise.all([params, searchParams, getTranslations("ControlPlane")]);
  const store = await getControlPlaneStore(slug);
  if (!store) notFound();
  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><Link href="/admin/stores" className="text-sm text-indigo-700 hover:underline">← {t("stores")}</Link><h1 className="mt-2 text-3xl font-bold">{store.displayName}</h1><p className="font-mono text-sm text-slate-500">{store.slug}</p></div>
        <div className="flex items-center gap-3"><StoreStatusBadge status={store.status} label={t(store.status)} /><a href={`/${store.slug}/admin`} className="rounded-md border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50">{t("openTenantAdmin")}</a></div>
      </header>
      {query.saved === "1" ? <p role="status" className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-emerald-900">{t("storeSaved")}</p> : null}
      {store.kind === "available" ? (
        <section className="grid gap-4 sm:grid-cols-3"><MetricCard label={t("orders")} value={formatNumber(store.metrics.orderCount)} /><MetricCard label={t("sales")} value={formatCurrency(store.metrics.salesVolume)} /><MetricCard label={t("lastActivity")} value={store.metrics.lastActivity ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(store.metrics.lastActivity) : t("noActivity")} /></section>
      ) : <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">{t("storeMetricsUnavailable")}</div>}
      <section className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <form action={updateStoreAction} className="space-y-5 rounded-xl border bg-white p-6 shadow-sm">
          <input type="hidden" name="slug" value={store.slug} />
          <h2 className="text-xl font-bold">{t("storeSettings")}</h2>
          <label className="grid gap-2"><span className="text-sm font-medium">{t("status")}</span><select name="status" defaultValue={store.status} className="rounded-md border px-3 py-2"><option value="active">{t("active")}</option><option value="suspended">{t("suspended")}</option><option value="disabled">{t("disabled")}</option></select></label>
          <label className="grid gap-2"><span className="text-sm font-medium">{t("plan")}</span><select name="plan" defaultValue={store.plan} className="rounded-md border px-3 py-2"><option value="small">{t("small")}</option><option value="medium">{t("medium")}</option><option value="large">{t("large")}</option></select></label>
          <label className="flex items-center gap-2"><input name="featured" type="checkbox" defaultChecked={store.featured} /><span className="text-sm font-medium">{t("featureStore")}</span></label>
          <label className="grid gap-2"><span className="text-sm font-medium">{t("featuredRank")}</span><input name="featuredRank" type="number" min="1" defaultValue={store.featuredRank ?? ""} className="rounded-md border px-3 py-2" /></label>
          <label className="grid gap-2"><span className="text-sm font-medium">{t("supportNotes")}</span><textarea name="supportNotes" maxLength={4000} defaultValue={store.supportNotes ?? ""} rows={5} className="rounded-md border px-3 py-2" placeholder={t("supportNotesPlaceholder")} /></label>
          <Button type="submit">{t("saveChanges")}</Button>
        </form>
        <aside className="space-y-3 rounded-xl border bg-white p-6 shadow-sm"><h2 className="font-bold">{t("storeIdentity")}</h2><dl className="space-y-3 text-sm"><div><dt className="text-slate-500">{t("schema")}</dt><dd className="font-mono">{store.schemaName}</dd></div><div><dt className="text-slate-500">{t("created")}</dt><dd>{new Intl.DateTimeFormat(undefined, { dateStyle: "long" }).format(store.createdAt)}</dd></div><div><dt className="text-slate-500">{t("updated")}</dt><dd>{new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeStyle: "short" }).format(store.updatedAt)}</dd></div></dl></aside>
      </section>
    </div>
  );
}
