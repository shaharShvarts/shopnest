import { getDb } from "@/drizzle/db";
import { categories, products, subcategories } from "@/drizzle/schema";
import { and, eq, isNull, or } from "drizzle-orm";
import ProductDetails from "../../_components/ProductDetails";
import DynamicBreadcrumb from "@/app/(customer)/components/Breadcrumb";
import { StorefrontPageHeader } from "../../../components/StorefrontPageHeader";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { InventoryService } from "@/lib/inventory/core";
import { DrizzleInventoryStore } from "@/lib/inventory/drizzle-store";

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

const fetchProductById = async (id: string) => {
  const db = await getDb();
  const [product] = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      price: products.price,
      imageUrl: products.imageUrl,
      quantity: products.quantity,
      categoryId: products.categoryId,
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
  };
};

export type fetchedProduct = NonNullable<
  Awaited<ReturnType<typeof fetchProductById>>
>;

export default async function ProductsPage({ params }: Params) {
  const { id } = await params;
  const product = await fetchProductById(id);
  if (!product) notFound();
  const t = await getTranslations("DetailsPage");
  const tb = await getTranslations("DetailsPage.Breadcrumbs");

  return (
    <>
      <StorefrontPageHeader>{t("header")}</StorefrontPageHeader>
      <DynamicBreadcrumb
        segments={[
          { label: tb("home"), href: "/" },
          {
            label: tb("category"),
            href: `/categories/${product.categoryId}/products`,
          },
          { label: tb("products") },
        ]}
      />
      <ProductDetails product={product} />
    </>
  );
}
