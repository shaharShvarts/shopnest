import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { count, isNull } from "drizzle-orm";
import { categories, products, subcategories } from "@/drizzle/schema";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { requireStoreManagementDb } from "@/lib/store-management/server";
import {
  entitlementHasCapacity,
  integerEntitlement,
} from "@/lib/store-entitlements/core";
import { getEffectiveStoreEntitlements } from "@/lib/store-entitlements/server";
import { ManagedProductForm } from "../../_components/ManagedProductForm";

export default async function NewManagedProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let storeId: number;
  try {
    storeId = parseStoreId((await params).id);
  } catch {
    notFound();
  }

  const [{ db, store, tenant }, t] = await Promise.all([
    requireStoreManagementDb(storeId, "catalog.manage"),
    getTranslations("StoreCatalogManagement"),
  ]);
  const [categoryRows, subcategoryRows, entitlementState, usageRows] =
    await Promise.all([
      db.select().from(categories).orderBy(categories.name),
      db.select().from(subcategories).orderBy(subcategories.name),
      getEffectiveStoreEntitlements(storeId),
      db
        .select({ value: count(products.id) })
        .from(products)
        .where(isNull(products.deletedAt)),
    ]);
  const productsLimit = integerEntitlement(
    entitlementState,
    "products_limit"
  );
  const currentUsage = Number(usageRows[0]?.value ?? 0);
  const canAddProduct = entitlementHasCapacity(productsLimit, currentUsage);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href={`/dashboard/stores/${storeId}/products`}
        className="text-sm font-semibold underline underline-offset-4"
      >
        {t("backToProducts")}
      </Link>
      <header className="mb-6 mt-4">
        <p className="text-sm text-muted-foreground">{store.displayName}</p>
        <h1 className="text-3xl font-bold tracking-tight">{t("addProduct")}</h1>
      </header>
      {!canAddProduct ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-6 text-amber-950">
          <h2 className="text-lg font-bold">{t("productQuotaReachedTitle")}</h2>
          <p className="mt-2">{t("productQuotaReached")}</p>
        </section>
      ) : (
      <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <ManagedProductForm
          storeId={storeId}
          tenantSlug={tenant.slug}
          categories={categoryRows}
          subcategories={subcategoryRows}
        />
      </section>
      )}
    </main>
  );
}
