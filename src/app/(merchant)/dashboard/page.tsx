import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { requireStoreDashboardPrincipal, getStoreManagementRepository } from "@/lib/store-management/server";
import { getMerchantOrganizationRepository } from "@/lib/merchant-organizations/server";
import { getMerchantStoreRepository } from "@/lib/merchant-stores/server";

export default async function MerchantDashboardPage() {
  const principal = await requireStoreDashboardPrincipal();

  if (principal.kind === "manager") {
    const [stores, tDashboard, tStore, tCatalog] = await Promise.all([
      getStoreManagementRepository().listManagedStores(principal.adminUserId),
      getTranslations("MerchantDashboard"),
      getTranslations("MerchantStore"),
      getTranslations("StoreCatalogManagement"),
    ]);

    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            {tDashboard("managerGreeting", { name: principal.displayName })}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {tDashboard("managerDetail")}
          </p>
        </header>

        <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">
                {tDashboard("assignedStores")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {tDashboard("managerPhaseOneDetail")}
              </p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
              {tDashboard("managerRole")}
            </span>
          </div>

          <ul className="mt-5 space-y-3">
            {stores.map((record) => (
              <li
                key={record.store.id}
                className="rounded-xl border border-border px-4 py-3"
              >
                <p className="font-semibold">{record.store.displayName}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tStore(record.store.status)}
                </p>
                {record.store.status === "provisioned" ? (
                  <Link
                    href={`/dashboard/stores/${record.store.id}/products`}
                    className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-border px-4 py-2 text-sm font-semibold"
                  >
                    Manage catalog
                  </Link>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </main>
    );
  }

  const merchant = principal;
  const organization =
    await getMerchantOrganizationRepository().findFirstForMerchant(
      merchant.merchantId
    );
  const stores = organization
    ? await getMerchantStoreRepository().listForMerchant(merchant.merchantId)
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
