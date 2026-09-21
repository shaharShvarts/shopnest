import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { logoutMerchantAction } from "./_actions";
import { DashboardNavigation } from "./_components/DashboardNavigation";

export default async function MerchantDashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const merchant = await requireMerchantPage();
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
                {merchant.displayName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {t("signedInAs")} {merchant.email}
              </p>
            </div>

            <form action={logoutMerchantAction}>
              <button
                type="submit"
                className="min-h-11 rounded-lg border border-border px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                {tAuth("logout")}
              </button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-4 sm:px-6 md:grid-cols-[13rem_minmax(0,1fr)] md:py-8 lg:px-8">
        <aside className="min-w-0 md:sticky md:top-6 md:self-start">
          <DashboardNavigation />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
