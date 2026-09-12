import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { listControlPlaneStores } from "@/lib/control-plane/server";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const [stores, t] = await Promise.all([listControlPlaneStores(), getTranslations("ControlPlane")]);
  return <div className="space-y-6"><header><h1 className="text-3xl font-bold">{t("plans")}</h1><p className="mt-2 text-slate-600">{t("plansDescription")}</p></header><section className="grid gap-4 md:grid-cols-3">{(["small", "medium", "large"] as const).map((plan) => { const assigned = stores.filter((store) => store.plan === plan); return <article key={plan} className="rounded-xl border bg-white p-6 shadow-sm"><h2 className="text-xl font-bold capitalize">{t(plan)}</h2><p className="mt-1 text-sm text-slate-500">{t("assignedStores", { count: assigned.length })}</p><div className="mt-4 space-y-2">{assigned.map((store) => <Link key={store.slug} href={`/admin/stores/${store.slug}`} className="block rounded-md border px-3 py-2 text-sm hover:bg-slate-50">{store.displayName}</Link>)}</div></article>; })}</section><p className="text-sm text-slate-500">{t("noPlanLimits")}</p></div>;
}
