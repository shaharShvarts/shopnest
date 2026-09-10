import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import LanguageSelector from "@/app/components/LanguageSelector";
import { logoutCurrentAdmin } from "@/app/admin/_actions/auth";
import { requireSuperAdminPage } from "@/lib/admin-auth/server";
import { INTERNAL_PATH_HEADER } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ShopNest Control Plane",
  description: "Platform administration for ShopNest staff",
};

export default async function ShopNestAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const internalPath = (await headers()).get(INTERNAL_PATH_HEADER);
  if (internalPath === "/shopnest/admin/login") return children;
  const admin = await requireSuperAdminPage();
  const t = await getTranslations("ControlPlane");
  const links = [
    ["/shopnest/admin", t("dashboard")],
    ["/shopnest/admin/stores", t("stores")],
    ["/shopnest/admin/plans", t("plans")],
    ["/shopnest/admin/featured", t("featured")],
  ];
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-800 bg-slate-950 text-white">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <Link href="/shopnest/admin" className="text-xl font-bold tracking-tight">ShopNest · {t("controlPlane")}</Link>
            <p className="text-xs text-slate-400">{t("platformAdministration")}</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-slate-300 sm:inline">{admin.email}</span>
            <LanguageSelector />
            <form action={logoutCurrentAdmin}><Button type="submit" variant="secondary" size="sm">{t("logout")}</Button></form>
          </div>
        </div>
      </header>
      <nav className="border-b bg-white" aria-label={t("controlPlaneNavigation")}>
        <div className="container mx-auto flex gap-1 overflow-x-auto px-4 py-2">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-950">{label}</Link>
          ))}
        </div>
      </nav>
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
