import Link from "next/link";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { categories, products, subcategories } from "@/drizzle/schema";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { requireStoreManagementDb } from "@/lib/store-management/server";
import { ManagedProductForm } from "../../../_components/ManagedProductForm";

export default async function EditManagedProductPage({
  params,
}: {
  params: Promise<{ id: string; productId: string }>;
}) {
  const route = await params;
  let storeId: number;
  const productId = Number(route.productId);
  try {
    storeId = parseStoreId(route.id);
  } catch {
    notFound();
  }
  if (!Number.isSafeInteger(productId) || productId <= 0) notFound();

  const [{ db, store }, t] = await Promise.all([
    requireStoreManagementDb(storeId, "catalog.manage"),
    getTranslations("StoreCatalogManagement"),
  ]);
  const [[product], categoryRows, subcategoryRows] = await Promise.all([
    db.select().from(products).where(eq(products.id, productId)).limit(1),
    db.select().from(categories).orderBy(categories.name),
    db.select().from(subcategories).orderBy(subcategories.name),
  ]);
  if (!product) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <Link
        href={`/dashboard/stores/${storeId}/products`}
        className="text-sm font-semibold underline underline-offset-4"
      >
        {t("backToProducts")}
      </Link>
      <header className="mb-6 mt-4">
        <p className="text-sm text-muted-foreground">{store.displayName}</p>
        <h1 className="text-3xl font-bold tracking-tight">{t("editProduct")}</h1>
      </header>
      <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <ManagedProductForm
          storeId={storeId}
          categories={categoryRows}
          subcategories={subcategoryRows}
          product={product}
        />
      </section>
    </main>
  );
}
