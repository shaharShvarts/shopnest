import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { isNull } from "drizzle-orm";
import { products } from "@/drizzle/schema";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { requireStoreManagementDb } from "@/lib/store-management/server";
import {
  entitlementHasCapacity,
  entitlementIsUnlimited,
  integerEntitlement,
} from "@/lib/store-entitlements/core";
import { getEffectiveStoreEntitlements } from "@/lib/store-entitlements/server";
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

  const [{ db, store }, t] = await Promise.all([
    requireStoreManagementDb(storeId, "catalog.manage"),
    getTranslations("StoreCatalogManagement"),
  ]);
  const [rows, entitlementState] = await Promise.all([
    db.select().from(products).orderBy(products.name),
    getEffectiveStoreEntitlements(storeId),
  ]);
  const productsLimit = integerEntitlement(
    entitlementState,
    "products_limit"
  );
  const currentUsage = rows.filter((product) => product.deletedAt === null).length;
  const canAddProduct = entitlementHasCapacity(productsLimit, currentUsage);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">{store.displayName}</p>
          <h1 className="text-3xl font-bold tracking-tight">{t("products")}</h1>
        </div>
        {canAddProduct ? (
          <Link
            href={`/dashboard/stores/${storeId}/products/new`}
            className="min-h-11 rounded-lg bg-foreground px-5 py-2.5 font-semibold text-background"
          >
            {t("addProduct")}
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="min-h-11 cursor-not-allowed rounded-lg bg-muted px-5 py-2.5 font-semibold text-muted-foreground"
          >
            {t("addProduct")}
          </span>
        )}
      </header>

      <CatalogNavigation storeId={storeId} />

      <div className="mb-4 rounded-xl border border-border bg-muted/30 p-4 text-sm">
        <p className="font-medium">
          {t("productQuota", {
            used: currentUsage,
            limit: entitlementIsUnlimited(productsLimit)
              ? t("unlimited")
              : productsLimit,
          })}
        </p>
        {!canAddProduct ? (
          <p className="mt-1 text-muted-foreground">
            {t("productQuotaReached")}
          </p>
        ) : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-background">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-start">{t("name")}</th>
              <th className="px-4 py-3 text-start">{t("price")}</th>
              <th className="px-4 py-3 text-start">{t("quantity")}</th>
              <th className="px-4 py-3 text-start">{t("active")}</th>
              <th className="px-4 py-3 text-end">{t("actions")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((product) => (
              <tr key={product.id} className="border-t border-border">
                <td className="px-4 py-3 text-start font-medium">{product.name}</td>
                <td className="px-4 py-3 text-start">{product.price}</td>
                <td className="px-4 py-3 text-start">{product.quantity}</td>
                <td className="px-4 py-3 text-start">{product.isActive ? t("yes") : t("no")}</td>
                <td className="px-4 py-3 text-end">
                  <div className="flex justify-end gap-2">
                    <Link
                      href={`/dashboard/stores/${storeId}/products/${product.id}/edit`}
                      className="rounded-lg border border-border px-3 py-2 font-semibold"
                    >
                      {t("edit")}
                    </Link>
                    <form action={deleteManagedProduct.bind(null, storeId, product.id)}>
                      <button
                        type="submit"
                        className="rounded-lg border border-destructive px-3 py-2 font-semibold text-destructive"
                      >
                        {t("delete")}
                      </button>
                    </form>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                  {t("noProducts")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
