import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { getMerchantStoreRepository } from "@/lib/merchant-stores/server";

export default async function MerchantStoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const merchant = await requireMerchantPage();

  let id: number;
  try {
    id = parseStoreId((await params).id);
  } catch {
    notFound();
  }

  const store =
    await getMerchantStoreRepository().findOwnedById(
      merchant.id,
      id
    );

  if (!store) {
    notFound();
  }

  const t = await getTranslations("MerchantStore");

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          ShopNest
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {store.displayName}
        </h1>
        <p className="mt-2 font-mono text-sm text-muted-foreground">
          shopnest.co.il/{store.slug}
        </p>
      </header>

      <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              {t("slug")}
            </dt>
            <dd className="mt-1 font-mono">{store.slug}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              {t("status")}
            </dt>
            <dd className="mt-1 font-medium">
              {t(store.status)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              {t("tenant")}
            </dt>
            <dd className="mt-1 font-medium">
              {store.tenantId === null
                ? t("notProvisioned")
                : "#" + store.tenantId}
            </dd>
          </div>
        </dl>

        {store.tenantId === null ? (
          <p className="mt-6 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            {t("notLiveYet")}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={"/dashboard/stores/" + store.id + "/edit"}
            className="min-h-11 rounded-lg bg-foreground px-5 py-2.5 font-semibold text-background"
          >
            {t("editStore")}
          </Link>
          <Link
            href="/dashboard/stores"
            className="min-h-11 rounded-lg border border-border px-5 py-2.5 font-semibold"
          >
            {t("backToStores")}
          </Link>
        </div>
      </section>
    </main>
  );
}
