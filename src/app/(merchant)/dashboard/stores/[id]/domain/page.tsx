import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { getMerchantStoreRepository } from "@/lib/merchant-stores/server";
import { getMerchantDomainView } from "@/lib/merchant-domains/server";
import { DomainManager } from "./DomainManager";

export const dynamic = "force-dynamic";

export default async function MerchantStoreDomainPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const merchant = await requireMerchantPage();

  let storeId: number;
  try {
    storeId = parseStoreId((await params).id);
  } catch {
    notFound();
  }

  const [store, view, t] = await Promise.all([
    getMerchantStoreRepository().findOwnedById(merchant.id, storeId),
    getMerchantDomainView(merchant.id, storeId),
    getTranslations("MerchantDomain"),
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

      <DomainManager view={view} />
    </main>
  );
}
