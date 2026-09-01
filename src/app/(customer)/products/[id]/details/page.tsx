import { getDbForTenant } from "@/drizzle/db";
import { categories, products, subcategories } from "@/drizzle/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import ProductDetails from "../../_components/ProductDetails";
import DynamicBreadcrumb from "@/app/(customer)/components/Breadcrumb";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { getCustomerStockMessage, InventoryService } from "@/lib/inventory/core";
import { DrizzleInventoryStore } from "@/lib/inventory/drizzle-store";
import { getTenant } from "@/lib/tenant-context";
import type { Tenant } from "@/lib/tenant";

type Params = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata() {
  const Metadata = await getTranslations("DetailsPage.Metadata");

  return {
    title: Metadata("title"),
    description: Metadata("description"),
  };
}

const fetchProductById = async (id: string, tenant: Tenant) => {
  const db = getDbForTenant(tenant);
  const [product] = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      price: products.price,
      imageUrl: products.imageUrl,
      quantity: products.quantity,
      categoryId: products.categoryId,
      categoryName: categories.name,
      subcategoryId: products.subcategoryId,
      subcategoryName: subcategories.name,
    })
    .from(products)
    .innerJoin(categories, eq(products.categoryId, categories.id))
    .leftJoin(subcategories, eq(products.subcategoryId, subcategories.id))
    .where(
      and(
        eq(products.id, Number(id)),
        eq(products.isActive, true),
        eq(products.isAvailable, true),
        isNull(products.deletedAt),
        eq(categories.isActive, true),
        isNull(categories.deletedAt),
        or(
          isNull(products.subcategoryId),
          and(
            eq(subcategories.categoryId, products.categoryId),
            eq(subcategories.isActive, true),
            isNull(subcategories.deletedAt)
          )
        )
      )
    )
    .limit(1);
  if (!product) return undefined;

  const availability = await new InventoryService(
    new DrizzleInventoryStore(db)
  ).getAvailability(product.id);

  return {
    ...product,
    quantity: availability.available,
    inventoryStatus: availability.status,
    customerStockMessage: getCustomerStockMessage(availability.available),
  };
};

export type fetchedProduct = NonNullable<
  Awaited<ReturnType<typeof fetchProductById>>
>;

export default async function ProductsPage({ params }: Params) {
  const { id } = await params;
  const tenant = await getTenant();
  if (!tenant) notFound();
  const product = await fetchProductById(id, tenant);
  if (!product) notFound();
  const tb = await getTranslations("DetailsPage.Breadcrumbs");

  return (
    <>
      <DynamicBreadcrumb
        segments={[
          { label: tb("home"), href: "/" },
          {
            label: product.categoryName,
            href: `/categories/${product.categoryId}/products`,
          },
          ...(product.subcategoryId && product.subcategoryName
            ? [
                {
                  label: product.subcategoryName,
                  href: `/categories/${product.categoryId}/subcategories/${product.subcategoryId}`,
                },
              ]
            : []),
          { label: product.name },
        ]}
      />
      <ProductDetails product={product} />
    </>
  );
}
