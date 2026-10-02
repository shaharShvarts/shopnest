import Link from "next/link";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { categories, subcategories } from "@/drizzle/schema";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { requireStoreManagementDb } from "@/lib/store-management/server";
import { CatalogNavigation } from "../_components/CatalogNavigation";
import { deleteManagedSubcategory } from "../_actions/catalog";

export default async function ManagedSubcategoriesPage({
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

  const [{ db, store }, t] = await Promise.all([
    requireStoreManagementDb(storeId, "catalog.manage"),
    getTranslations("StoreCatalogManagement"),
  ]);
  const rows = await db
    .select({
      id: subcategories.id,
      name: subcategories.name,
      isActive: subcategories.isActive,
      categoryName: categories.name,
    })
    .from(subcategories)
    .innerJoin(categories, eq(subcategories.categoryId, categories.id))
    .orderBy(subcategories.name);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{store.displayName}</p>
          <h1 className="text-3xl font-bold tracking-tight">{t("subcategories")}</h1>
        </div>
        <Button asChild size="management">
          <Link href={`/dashboard/stores/${storeId}/subcategories/new`}>{t("addSubcategory")}</Link>
        </Button>
      </header>

      <CatalogNavigation storeId={storeId} />

      <div className="overflow-x-auto rounded-2xl border border-border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-start">{t("name")}</th>
              <th className="px-4 py-3 text-start">{t("category")}</th>
              <th className="px-4 py-3 text-start">{t("active")}</th>
              <th className="px-4 py-3 text-end">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((subcategory) => (
              <tr key={subcategory.id} className="border-t border-border">
                <td className="px-4 py-3 text-start font-medium">{subcategory.name}</td>
                <td className="px-4 py-3 text-start">{subcategory.categoryName}</td>
                <td className="px-4 py-3 text-start">
                  {subcategory.isActive ? t("yes") : t("no")}
                </td>
                <td className="px-4 py-3 text-end">
                  <div className="flex justify-end gap-2">
                    <Button asChild variant="outline" size="management" className="px-3">
                      <Link href={`/dashboard/stores/${storeId}/subcategories/${subcategory.id}/edit`}>
                        {t("edit")}
                      </Link>
                    </Button>
                    <form action={deleteManagedSubcategory.bind(null, storeId, subcategory.id)}>
                      <Button
                        type="submit"
                        variant="outline"
                        size="management"
                        className="border-red-200 px-3 text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800"
                      >
                        {t("delete")}
                      </Button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  {t("noSubcategories")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
