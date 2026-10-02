import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { listControlPlaneStores } from "@/lib/control-plane/server";

export const dynamic = "force-dynamic";

export default async function FeaturedPage() {
  const [allStores, t] = await Promise.all([listControlPlaneStores(), getTranslations("ControlPlane")]);
  const stores = allStores.filter((store) => store.featured).sort((a, b) => (a.featuredRank ?? Number.MAX_SAFE_INTEGER) - (b.featuredRank ?? Number.MAX_SAFE_INTEGER) || a.displayName.localeCompare(b.displayName));
  return <div className="space-y-6"><header><h1 className="text-3xl font-bold">{t("featured")}</h1><p className="mt-2 text-slate-600">{t("featuredDescription")}</p></header>{stores.length ? <div className="grid gap-3">{stores.map((store) => <Link key={store.slug} href={`/admin/stores/${store.slug}`} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"><span><strong>{store.displayName}</strong><span className="ms-3 font-mono text-xs text-slate-500">{store.slug}</span></span><span className="text-sm text-slate-500">{store.featuredRank ? `#${store.featuredRank}` : t("unranked")}</span></Link>)}</div> : <p className="rounded-xl border border-slate-200 bg-white p-6 text-slate-500 shadow-sm">{t("noFeaturedStores")}</p>}</div>;
}
