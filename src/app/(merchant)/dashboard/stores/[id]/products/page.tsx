import Link from "next/link";
import { notFound } from "next/navigation";
import { products } from "@/drizzle/schema";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { requireStoreManagementDb } from "@/lib/store-management/server";
import { CatalogNavigation } from "../_components/CatalogNavigation";
import { deleteManagedProduct } from "../_actions/catalog";

export default async function ManagedProductsPage({
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
    .from(products)
    .orderBy(products.name);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{store.displayName}</p>
          <h1 className="text-3xl font-bold tracking-tight">Products</h1>
        </div>
        <Link
          href={`/dashboard/stores/${storeId}/products/new`}
          className="min-h-11 rounded-lg bg-foreground px-5 py-2.5 font-semibold text-background"
        >
          Add product
        </Link>
      </header>

      <CatalogNavigation storeId={storeId} />

      <div className="overflow-x-auto rounded-2xl border border-border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-start">Name</th>
              <th className="px-4 py-3 text-start">Price</th>
              <th className="px-4 py-3 text-start">Quantity</th>
              <th className="px-4 py-3 text-start">Active</th>
              <th className="px-4 py-3 text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => (
              <tr key={product.id} className="border-t border-border">
                <td className="px-4 py-3 text-start font-medium">{product.name}</td>
                <td className="px-4 py-3 text-start">{product.price}</td>
                <td className="px-4 py-3 text-start">{product.quantity}</td>
                <td className="px-4 py-3 text-start">{product.isActive ? "Yes" : "No"}</td>
                <td className="px-4 py-3 text-end">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/dashboard/stores/${storeId}/products/${product.id}/edit`}
                      className="rounded-lg border border-border px-3 py-2 font-semibold"
                    >
                      Edit
                    </Link>
                    <form
                      action={deleteManagedProduct.bind(
                        null,
                        storeId,
                        product.id
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
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  No products yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
