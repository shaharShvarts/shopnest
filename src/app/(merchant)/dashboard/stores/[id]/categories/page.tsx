import Link from "next/link";
import { notFound } from "next/navigation";
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

  const { db, store } = await requireStoreManagementDb(
    storeId,
    "catalog.manage"
  );
  const rows = await db
    .select()
    .from(categories)
    .orderBy(categories.name);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{store.displayName}</p>
          <h1 className="text-3xl font-bold tracking-tight">Categories</h1>
        </div>
        <Link
          href={`/dashboard/stores/${storeId}/categories/new`}
          className="min-h-11 rounded-lg bg-foreground px-5 py-2.5 font-semibold text-background"
        >
          Add category
        </Link>
      </header>

      <CatalogNavigation storeId={storeId} />

      <div className="overflow-x-auto rounded-2xl border border-border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Active</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((category) => (
              <tr key={category.id} className="border-t border-border">
                <td className="px-4 py-3 font-medium">{category.name}</td>
                <td className="px-4 py-3">
                  {category.isActive ? "Yes" : "No"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/dashboard/stores/${storeId}/categories/${category.id}/edit`}
                      className="rounded-lg border border-border px-3 py-2 font-semibold"
                    >
                      Edit
                    </Link>
                    <form
                      action={deleteManagedCategory.bind(
                        null,
                        storeId,
                        category.id
                      )}
                    >
                      <button
                        type="submit"
                        className="rounded-lg border border-destructive px-3 py-2 font-semibold text-destructive"
                      >
                        Delete
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">
                  No categories yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
