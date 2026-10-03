import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { requireStoreDashboardPrincipal } from "@/lib/store-management/server";
import { logoutDashboardAction } from "./_actions";
import { DashboardNavigation } from "./_components/DashboardNavigation";
import { DashboardLanguageSwitcher } from "./_components/DashboardLanguageSwitcher";

export default async function MerchantDashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const principal = await requireStoreDashboardPrincipal();
  const locale = await getLocale();
  const t = await getTranslations("MerchantDashboard");
  const tAuth = await getTranslations("MerchantAuth");

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="min-w-0">
            <Link
              href="/dashboard"
              className="text-lg font-bold tracking-tight"
            >
              ShopNest
            </Link>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {t("workspace")}
            </p>
          </div>

          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <div className="hidden min-w-0 text-end sm:block">
              <p className="truncate text-sm font-semibold">
                {principal.displayName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {t("signedInAs")} {principal.email}
              </p>
            </div>

            <DashboardLanguageSwitcher locale={locale === "en" ? "en" : "he"} />

            <form action={logoutDashboardAction}>
              <Button
                type="submit"
                variant="outline"
                size="management"
                className="px-4"
              >
                {tAuth("logout")}
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-4 sm:px-6 md:grid-cols-[13rem_minmax(0,1fr)] md:py-8 lg:px-8">
        <aside className="min-w-0 md:sticky md:top-6 md:self-start">
          <DashboardNavigation role={principal.kind} />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
