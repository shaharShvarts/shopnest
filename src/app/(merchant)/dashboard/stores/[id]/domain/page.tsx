import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { getMerchantStoreRepository } from "@/lib/merchant-stores/server";
import { getMerchantDomainView } from "@/lib/merchant-domains/server";
import { DomainManager } from "./DomainManager";
import { rollbackDomainAction } from "./_actions";
import { storeHasBooleanEntitlement } from "@/lib/store-entitlements/server";

export const dynamic = "force-dynamic";

export default async function MerchantStoreDomainPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rollback?: string }>;
}) {
  const merchant = await requireMerchantPage();

  let storeId: number;
  try {
    storeId = parseStoreId((await params).id);
  } catch {
    notFound();
  }

  const [store, view, customDomainEnabled, t, query] = await Promise.all([
    getMerchantStoreRepository().findOwnedById(merchant.id, storeId),
    getMerchantDomainView(merchant.id, storeId),
    storeHasBooleanEntitlement(storeId, "custom_domain"),
    getTranslations("MerchantDomain"),
    searchParams,
  ]);

  if (!store || !view || store.tenantId === null) {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <Link
          href={"/dashboard/stores/" + store.id}
          className="text-sm font-semibold underline underline-offset-4"
        >
          {t("backToStore")}
        </Link>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {store.displayName}
        </p>
      </header>

      {query.rollback === "1" ? (
        <p
          role="status"
          className="mb-6 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          {t("rollbackComplete")}
        </p>
      ) : null}

      {view.retiring ? (
        <section className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 sm:p-6">
          <h2 className="font-bold text-amber-950">
            {t("rollbackTitle")}
          </h2>
          <p className="mt-2 text-sm text-amber-950">
            {t("rollbackHelp", {
              hostname: view.retiring.hostname,
            })}
          </p>

          <form action={rollbackDomainAction} className="mt-4">
            <input
              type="hidden"
              name="storeId"
              value={store.id}
            />
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-foreground px-5 font-semibold text-background"
            >
              {t("rollbackDomain")}
            </button>
          </form>
        </section>
      ) : null}

      <DomainManager
        view={view}
        customDomainEnabled={customDomainEnabled}
      />
    </main>
  );
}
