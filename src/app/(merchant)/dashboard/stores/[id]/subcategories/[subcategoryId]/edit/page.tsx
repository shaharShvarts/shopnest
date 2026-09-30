import Link from "next/link";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { categories, subcategories } from "@/drizzle/schema";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { requireStoreManagementDb } from "@/lib/store-management/server";
import { ManagedSubcategoryForm } from "../../../_components/ManagedSubcategoryForm";

export default async function EditManagedSubcategoryPage({
  params,
}: {
  params: Promise<{ id: string; subcategoryId: string }>;
}) {
  const route = await params;
  let storeId: number;
  const subcategoryId = Number(route.subcategoryId);
  try {
    storeId = parseStoreId(route.id);
  } catch {
    notFound();
  }
  if (!Number.isSafeInteger(subcategoryId) || subcategoryId <= 0) notFound();

  const [{ db, store, tenant }, t] = await Promise.all([
    requireStoreManagementDb(storeId, "catalog.manage"),
    getTranslations("StoreCatalogManagement"),
  ]);
  const [[subcategory], categoryRows] = await Promise.all([
    db.select().from(subcategories).where(eq(subcategories.id, subcategoryId)).limit(1),
    db.select().from(categories).orderBy(categories.name),
  ]);
  if (!subcategory) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <Link
        href={`/dashboard/stores/${storeId}/subcategories`}
        className="text-sm font-semibold underline underline-offset-4"
      >
        {t("backToSubcategories")}
      </Link>
      <header className="mb-6 mt-4">
        <p className="text-sm text-muted-foreground">{store.displayName}</p>
        <h1 className="text-3xl font-bold tracking-tight">{t("editSubcategory")}</h1>
      </header>
      <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <ManagedSubcategoryForm storeId={storeId} tenantSlug={tenant.slug} categories={categoryRows} subcategory={subcategory} />
      </section>
    </main>
  );
}
