import Link from "next/link";
import { cookies, headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import LanguageSelector from "@/app/components/LanguageSelector";
import { logoutCurrentAdmin } from "@/app/[tenant]/admin/_actions/auth";
import { requireSuperAdminPage } from "@/lib/admin-auth/server";
import { INTERNAL_PATH_HEADER } from "@/lib/tenant";
import { AdminNavigation } from "./_components/AdminNavigation";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "ShopNest Control Plane",
  description: "Platform administration for ShopNest staff",
};

export default async function ShopNestAdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const internalPath = (await headers()).get(INTERNAL_PATH_HEADER);
  if (internalPath === "/admin/login") return children;
  const admin = await requireSuperAdminPage();
  const [t, cookieStore] = await Promise.all([
    getTranslations("ControlPlane"),
    cookies(),
  ]);
  const locale =
    cookieStore.get("SHOPNEST_LOCALE")?.value === "en" ? "en" : "he";
  const links = [
    { href: "/admin", label: t("dashboard") },
    { href: "/admin/stores", label: t("stores") },
    { href: "/admin/plans", label: t("plans") },
    { href: "/admin/featured", label: t("featured") },
  ];
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="border-b border-slate-800 bg-slate-950 text-white shadow-sm">
        <div className="container mx-auto flex flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <Link
              href="/admin"
              className="inline-flex items-baseline gap-2 text-white transition-opacity hover:opacity-90"
            >
              <span className="text-xl font-bold tracking-tight">ShopNest</span>
              <span className="text-sm font-semibold text-slate-300">
                {t("controlPlane")}
              </span>
            </Link>
            <p className="mt-0.5 text-xs text-slate-300">
              {t("platformAdministration")}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="hidden text-slate-300 lg:inline">{admin.email}</span>
            <LanguageSelector locale={locale} />
            <form action={logoutCurrentAdmin}>
              <Button
                type="submit"
                variant="outline"
                className="h-10 min-w-24 border-slate-600 bg-slate-900 px-4 text-white hover:bg-slate-800 hover:text-white"
              >
                {t("logout")}
              </Button>
            </form>
          </div>
        </div>
      </header>
      <AdminNavigation
        items={links}
        ariaLabel={t("controlPlaneNavigation")}
      />
      <main className="container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
