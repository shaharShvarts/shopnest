import { getTranslations } from "next-intl/server";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import { getControlPlaneOverview } from "@/lib/control-plane/server";
import { requireSuperAdminPage } from "@/lib/admin-auth/server";
import { MetricCard } from "./_components/MetricCard";
import { StoreTable } from "./_components/StoreTable";

export const dynamic = "force-dynamic";

export default async function ShopNestAdminPage() {
  await requireSuperAdminPage();
  const [{ stores, metrics }, t] = await Promise.all([getControlPlaneOverview(), getTranslations("ControlPlane")]);
  return (
    <div className="space-y-8">
      <header><p className="text-sm font-semibold uppercase tracking-widest text-indigo-700">ShopNest</p><h1 className="text-3xl font-bold tracking-tight">{t("dashboard")}</h1><p className="mt-2 text-slate-600">{t("dashboardDescription")}</p></header>
      {!metrics.complete ? <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">{t("incompleteMetrics", { stores: metrics.failedStores.join(", ") })}</div> : null}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label={t("registeredStores")} value={formatNumber(metrics.registeredStores)} />
        <MetricCard label={t("activeStores")} value={formatNumber(metrics.activeStores)} />
        <MetricCard label={t("disabledStores")} value={formatNumber(metrics.unavailableStores)} />
        <MetricCard label={t("totalOrders")} value={formatNumber(metrics.totalOrders)} detail={metrics.complete ? undefined : t("partialTotal")} />
        <MetricCard label={t("totalRevenue")} value={formatCurrency(metrics.totalRevenue)} detail={metrics.complete ? undefined : t("partialTotal")} />
        <MetricCard label={t("ordersToday")} value={formatNumber(metrics.ordersToday)} detail={t("utcDay")} />
        <MetricCard label={t("revenueToday")} value={formatCurrency(metrics.revenueToday)} detail={t("utcDay")} />
      </section>
      <section className="space-y-3"><h2 className="text-xl font-bold">{t("stores")}</h2><StoreTable stores={stores} /></section>
    </div>
  );
}
