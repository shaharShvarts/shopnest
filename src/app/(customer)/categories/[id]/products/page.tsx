import { getDbForTenant } from "@/drizzle/db";
import { and, desc, eq, isNull, or } from "drizzle-orm";
import { categories, products, subcategories } from "@/drizzle/schema";
import { ProductCard } from "@/app/components/ProductCard";
import { StorefrontPageHeader } from "../../../components/StorefrontPageHeader";
import DynamicBreadcrumb from "@/app/(customer)/components/Breadcrumb";
import { getTranslations } from "next-intl/server";
import { getTenant } from "@/lib/tenant-context";
import type { Tenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { InventoryService } from "@/lib/inventory/core";
import { DrizzleInventoryStore } from "@/lib/inventory/drizzle-store";

type ProductsPageProps = {
  params: Promise<{ id: string }>;
};

const fetchCategoryWithProducts = async (id: number, tenant: Tenant | null) => {
  const db = getDbForTenant(tenant);
  const [category] = await db
    .select({ name: categories.name })
    .from(categories)
    .where(
      and(
        eq(categories.id, id),
        eq(categories.isActive, true),
        isNull(categories.deletedAt)
      )
    )
    .limit(1);
  if (!category) return null;

  const productArr = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      price: products.price,
      imageUrl: products.imageUrl,
      quantity: products.quantity,
    })
    .from(products)
    .leftJoin(subcategories, eq(products.subcategoryId, subcategories.id))
    .where(
      and(
        eq(products.categoryId, id),
        eq(products.isActive, true),
        eq(products.isAvailable, true),
        isNull(products.deletedAt),
        or(
          isNull(products.subcategoryId),
          and(
            eq(subcategories.isActive, true),
            isNull(subcategories.deletedAt)
          )
        )
      )
    )
    .orderBy(desc(products.name));

  const availability = await new InventoryService(
    new DrizzleInventoryStore(db)
  ).getAvailabilityBatch(productArr.map((product) => product.id));

  return {
    categoryName: category.name,
    products: productArr.map((product) => ({
      ...product,
      quantity: availability.get(product.id)?.available ?? 0,
      inventoryStatus:
        availability.get(product.id)?.status ?? "out_of_stock",
    })),
  };
};

export type ProductPageProps = Awaited<
  ReturnType<typeof fetchCategoryWithProducts>
> extends infer Result
  ? Result extends { products: Array<infer Product> }
    ? Product
    : never
  : never;

export default async function ProductsPage({ params }: ProductsPageProps) {
  const { id } = await params;
  const tenant = await getTenant();
  const t = await getTranslations("ProductsPage");
  const tb = await getTranslations("ProductsPage.Breadcrumbs");

  const catalog = await fetchCategoryWithProducts(Number(id), tenant);
  if (!catalog) notFound();
  const { categoryName, products } = catalog;

  return (
    <>
      <StorefrontPageHeader>{t("header")}</StorefrontPageHeader>
      <DynamicBreadcrumb
        segments={[
          { label: tb("home"), href: "/" },
          { label: tb("categories"), href: "/categories" },
          { label: categoryName, href: `/categories/${id}/products` },
          { label: tb("products") },
        ]}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <ProductsSuspense products={products} tenantSlug={tenant?.slug ?? ""} />
      </div>
    </>
  );
}

type productsProps = {
  products: ProductPageProps[];
  tenantSlug: string;
};

async function ProductsSuspense({ products, tenantSlug }: productsProps) {
  return products.map((product) => (
    <ProductCard key={product.id} {...product} tenantSlug={tenantSlug} />
  ));
}
