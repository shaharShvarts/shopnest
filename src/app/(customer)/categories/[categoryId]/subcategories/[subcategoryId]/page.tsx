import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import DynamicBreadcrumb from "@/app/(customer)/components/Breadcrumb";
import { StorefrontPageHeader } from "@/app/(customer)/components/StorefrontPageHeader";
import { ProductCard } from "@/app/components/ProductCard";
import { getDbForTenant } from "@/drizzle/db";
import { InventoryService } from "@/lib/inventory/core";
import { DrizzleInventoryStore } from "@/lib/inventory/drizzle-store";
import { getSubcategoryCatalog } from "@/lib/storefront-catalog/core";
import { DrizzleStorefrontCatalogStore } from "@/lib/storefront-catalog/drizzle-store";
import { getTenant } from "@/lib/tenant-context";

type SubcategoryPageProps = {
  params: Promise<{ categoryId: string; subcategoryId: string }>;
};

export default async function SubcategoryPage({
  params,
}: SubcategoryPageProps) {
  const { categoryId, subcategoryId } = await params;
  const tenant = await getTenant();
  if (!tenant) notFound();

  const db = getDbForTenant(tenant);
  const catalog = await getSubcategoryCatalog(
    new DrizzleStorefrontCatalogStore(db),
    new InventoryService(new DrizzleInventoryStore(db)),
    Number(categoryId),
    Number(subcategoryId)
  );
  if (!catalog) notFound();

  const t = await getTranslations("CatalogUX");
  const tb = await getTranslations("ProductsPage.Breadcrumbs");
  const { category, subcategory, products } = catalog;

  return (
    <div className="space-y-8 sm:space-y-10">
      <div>
        <DynamicBreadcrumb
          segments={[
            { label: tb("home"), href: "/" },
            {
              label: category.name,
              href: `/categories/${category.id}/products`,
            },
            { label: subcategory.name },
          ]}
        />
        <StorefrontPageHeader>{subcategory.name}</StorefrontPageHeader>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          {t("subcategoryProductsDetail", { category: category.name })}
        </p>
      </div>

      {products.length > 0 ? (
        <section
          aria-label={t("products")}
          className="grid min-w-0 grid-cols-1 gap-4 min-[430px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        >
          {products.map((product) => (
            <ProductCard
              key={product.id}
              {...product}
              tenantSlug={tenant.slug}
            />
          ))}
        </section>
      ) : (
        <div className="rounded-2xl bg-muted/60 p-8 text-center sm:p-12">
          <h2 className="text-lg font-semibold">{t("emptySubcategory")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("emptySubcategoryDetail")}
          </p>
        </div>
      )}
    </div>
  );
}
