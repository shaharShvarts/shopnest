import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { getMerchantOrganizationRepository } from "@/lib/merchant-organizations/server";
import { logoutMerchantAction } from "./_actions";

export default async function MerchantDashboardPage() {
  const merchant = await requireMerchantPage();
  const organization =
    await getMerchantOrganizationRepository().findFirstForMerchant(merchant.id);
  const t = await getTranslations("MerchantAuth");
  const tOrganization = await getTranslations("MerchantOrganization");

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          ShopNest
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {t("dashboardGreeting", { name: merchant.displayName })}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("dashboardDetail")}</p>
      </header>

      <div className="space-y-6">
        <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t("email")}
              </dt>
              <dd className="mt-1 break-all font-medium">{merchant.email}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t("phone")}
              </dt>
              <dd className="mt-1 font-medium">
                {merchant.phoneE164 ?? t("notAvailable")}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t("status")}
              </dt>
              <dd className="mt-1 font-medium">{t(merchant.status)}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
          <h2 className="text-xl font-bold">
            {tOrganization("yourBusiness")}
          </h2>

          {organization ? (
            <>
              <p className="mt-2 text-muted-foreground">
                {tOrganization("businessReady")}
              </p>
              <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    {tOrganization("businessName")}
                  </dt>
                  <dd className="mt-1 font-medium">{organization.displayName}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    {tOrganization("role")}
                  </dt>
                  <dd className="mt-1 font-medium">{tOrganization("owner")}</dd>
                </div>
              </dl>
              <Link
                href="/dashboard/business"
                className="mt-6 inline-flex min-h-11 items-center rounded-lg border border-border px-4 py-2 font-semibold"
              >
                {tOrganization("manageBusiness")}
              </Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-muted-foreground">
                {tOrganization("noBusinessYet")}
              </p>
              <Link
                href="/dashboard/business/new"
                className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-foreground px-4 py-2 font-semibold text-background"
              >
                {tOrganization("createYourBusiness")}
              </Link>
            </>
          )}
        </section>

        <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
          <p className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            {t("storeSetupLater")}
          </p>

          <form action={logoutMerchantAction} className="mt-6">
            <button
              type="submit"
              className="min-h-11 rounded-lg border border-border px-4 py-2 font-semibold"
            >
              {t("logout")}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
