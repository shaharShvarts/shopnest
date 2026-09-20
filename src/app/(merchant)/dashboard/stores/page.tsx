import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { getMerchantOrganizationRepository } from "@/lib/merchant-organizations/server";
import { getMerchantStoreRepository } from "@/lib/merchant-stores/server";
import { StoreList } from "./_components/StoreList";

export default async function MerchantStoresPage() {
  const merchant = await requireMerchantPage();
  const organization =
    await getMerchantOrganizationRepository().findFirstForMerchant(
      merchant.id
    );

  if (!organization) {
    redirect("/dashboard/business/new");
  }

  const stores =
    await getMerchantStoreRepository().listForMerchant(
      merchant.id
    );
  const t = await getTranslations("MerchantStore");

  const items = stores.map((store) => ({
    id: store.id,
    displayName: store.displayName,
    slug: store.slug,
    status: store.status,
    tenantId: store.tenantId,
    updatedAt: store.updatedAt.toISOString(),
  }));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            ShopNest
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {t("myStores")}
          </h1>
        </div>
        <Link
          href="/dashboard/stores/new"
          className="min-h-11 rounded-lg bg-foreground px-5 py-2.5 font-semibold text-background"
        >
          {t("addStore")}
        </Link>
      </div>

      {items.length === 0 ? (
        <section className="mt-8 rounded-2xl bg-background p-8 shadow-sm ring-1 ring-black/5">
          <p className="text-muted-foreground">
            {t("noStoresYet")}
          </p>
          <Link
            href="/dashboard/stores/new"
            className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-foreground px-5 py-2.5 font-semibold text-background"
          >
            {t("createFirstStore")}
          </Link>
        </section>
      ) : (
        <StoreList stores={items} />
      )}
    </main>
  );
}
