import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { getMerchantOrganizationRepository } from "@/lib/merchant-organizations/server";
import { getMerchantStoreRepository } from "@/lib/merchant-stores/server";

export default async function MerchantDashboardPage() {
  const merchant = await requireMerchantPage();
  const organization =
    await getMerchantOrganizationRepository().findFirstForMerchant(
      merchant.id
    );
  const stores = organization
    ? await getMerchantStoreRepository().listForMerchant(merchant.id)
    : [];

  const t = await getTranslations("MerchantAuth");
  const tOrganization = await getTranslations("MerchantOrganization");
  const tStore = await getTranslations("MerchantStore");

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {t("dashboardGreeting", { name: merchant.displayName })}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t("dashboardDetail")}
        </p>
      </header>

      <div className="space-y-6">
        <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">
                {t("email")}
              </dt>
              <dd className="mt-1 break-all font-medium">
                {merchant.email}
              </dd>
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
              <dd className="mt-1 font-medium">
                {t(merchant.status)}
              </dd>
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
                  <dd className="mt-1 font-medium">
                    {organization.displayName}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-muted-foreground">
                    {tOrganization("role")}
                  </dt>
                  <dd className="mt-1 font-medium">
                    {tOrganization("owner")}
                  </dd>
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

        {organization ? (
          <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
            <h2 className="text-xl font-bold">
              {tStore("myStores")}
            </h2>

            {stores.length === 0 ? (
              <>
                <p className="mt-2 text-muted-foreground">
                  {tStore("noStoresYet")}
                </p>
                <Link
                  href="/dashboard/stores/new"
                  className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-foreground px-4 py-2 font-semibold text-background"
                >
                  {tStore("createFirstStore")}
                </Link>
              </>
            ) : (
              <>
                <p className="mt-2 text-muted-foreground">
                  {tStore("storesReady", { count: stores.length })}
                </p>
                <ul className="mt-4 space-y-2">
                  {stores.slice(0, 3).map((store) => (
                    <li key={store.id}>
                      {store.displayName} — {tStore(store.status)}
                    </li>
                  ))}
                </ul>
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link
                    href="/dashboard/stores"
                    className="min-h-11 rounded-lg border border-border px-4 py-2 font-semibold"
                  >
                    {tStore("manageStores")}
                  </Link>
                  <Link
                    href="/dashboard/stores/new"
                    className="min-h-11 rounded-lg bg-foreground px-4 py-2 font-semibold text-background"
                  >
                    {tStore("addStore")}
                  </Link>
                </div>
              </>
            )}
          </section>
        ) : null}
      </div>
    </main>
  );
}
