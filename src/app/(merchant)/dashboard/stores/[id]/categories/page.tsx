import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { categories } from "@/drizzle/schema";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { requireStoreManagementDb } from "@/lib/store-management/server";
import { CatalogNavigation } from "../_components/CatalogNavigation";
import { deleteManagedCategory } from "../_actions/catalog";

export default async function ManagedCategoriesPage({
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
  const rows = await db.select().from(categories).orderBy(categories.name);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{store.displayName}</p>
          <h1 className="text-3xl font-bold tracking-tight">{t("categories")}</h1>
        </div>
        <Button asChild size="management">
          <Link href={`/dashboard/stores/${storeId}/categories/new`}>{t("addCategory")}</Link>
        </Button>
      </header>

      <CatalogNavigation storeId={storeId} />

      <div className="overflow-x-auto rounded-2xl border border-border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-start">{t("name")}</th>
              <th className="px-4 py-3 text-start">{t("active")}</th>
              <th className="px-4 py-3 text-end">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((category) => (
              <tr key={category.id} className="border-t border-border">
                <td className="px-4 py-3 text-start font-medium">{category.name}</td>
                <td className="px-4 py-3 text-start">
                  {category.isActive ? t("yes") : t("no")}
                </td>
                <td className="px-4 py-3 text-end">
                  <div className="flex justify-end gap-2">
                    <Button asChild variant="outline" size="management" className="px-3">
                      <Link href={`/dashboard/stores/${storeId}/categories/${category.id}/edit`}>
                        {t("edit")}
                      </Link>
                    </Button>
                    <form action={deleteManagedCategory.bind(null, storeId, category.id)}>
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
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  {t("noCategories")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
