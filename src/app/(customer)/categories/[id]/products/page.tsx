import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import DynamicBreadcrumb from "@/app/(customer)/components/Breadcrumb";
import { StorefrontPageHeader } from "@/app/(customer)/components/StorefrontPageHeader";
import { ProductCard } from "@/app/components/ProductCard";
import { SubcategoryCard } from "@/app/components/SubcategoryCard";
import { getDbForTenant } from "@/drizzle/db";
import { InventoryService } from "@/lib/inventory/core";
import { DrizzleInventoryStore } from "@/lib/inventory/drizzle-store";
import { getCategoryCatalog } from "@/lib/storefront-catalog/core";
import { DrizzleStorefrontCatalogStore } from "@/lib/storefront-catalog/drizzle-store";
import { getTenant } from "@/lib/tenant-context";

type ProductsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ProductsPage({ params }: ProductsPageProps) {
  const { id } = await params;
  const tenant = await getTenant();
  if (!tenant) notFound();

  const db = getDbForTenant(tenant);
  const catalog = await getCategoryCatalog(
    new DrizzleStorefrontCatalogStore(db),
    new InventoryService(new DrizzleInventoryStore(db)),
    Number(id)
  );
  if (!catalog) notFound();

  const t = await getTranslations("CatalogUX");
  const tb = await getTranslations("ProductsPage.Breadcrumbs");
  const { category, subcategories, directProducts } = catalog;
  const isCompletelyEmpty =
    subcategories.length === 0 && directProducts.length === 0;

  return (
    <div className="space-y-8 sm:space-y-10">
      <div>
        <DynamicBreadcrumb
          segments={[
            { label: tb("home"), href: "/" },
            { label: category.name },
          ]}
        />
        <StorefrontPageHeader>{category.name}</StorefrontPageHeader>
      </div>

      {isCompletelyEmpty ? (
        <CatalogEmptyState
          title={t("emptyCategory")}
          detail={t("emptyCategoryDetail")}
        />
      ) : (
        <>
          {subcategories.length > 0 && (
            <section aria-labelledby="subcategory-heading" className="space-y-4">
              <SectionHeading
                id="subcategory-heading"
                title={t("shopByCategory")}
                detail={t("shopByCategoryDetail")}
              />
              <div className="grid min-w-0 grid-cols-1 gap-4 min-[430px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {subcategories.map((subcategory) => (
                  <SubcategoryCard key={subcategory.id} {...subcategory} />
                ))}
              </div>
            </section>
          )}

          <section aria-labelledby="direct-products-heading" className="space-y-4">
            <SectionHeading
              id="direct-products-heading"
              title={t("products")}
              detail={t("directProductsDetail")}
            />
            {directProducts.length > 0 ? (
              <div className="grid min-w-0 grid-cols-1 gap-4 min-[430px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {directProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    {...product}
                    tenantSlug={tenant.slug}
                  />
                ))}
              </div>
            ) : (
              <CatalogEmptyState
                title={t("noDirectProducts")}
                detail={t("chooseSubcategory")}
                compact
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}

function SectionHeading({
  id,
  title,
  detail,
}: {
  id: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="space-y-1">
      <h2 id={id} className="text-xl font-bold tracking-tight sm:text-2xl">
        {title}
      </h2>
      <p className="text-sm text-muted-foreground sm:text-base">{detail}</p>
    </div>
  );
}

function CatalogEmptyState({
  title,
  detail,
  compact = false,
}: {
  title: string;
  detail: string;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl bg-muted/60 text-center ${
        compact ? "p-5" : "p-8 sm:p-12"
      }`}
    >
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{detail}</p>
    </div>
  );
}
