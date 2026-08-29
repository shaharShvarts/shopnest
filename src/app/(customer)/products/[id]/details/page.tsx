import { getDb } from "@/drizzle/db";
import { categories, products, subcategories } from "@/drizzle/schema";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import ProductDetails from "../../_components/ProductDetails";
import DynamicBreadcrumb from "@/app/(customer)/components/Breadcrumb";
import { PageHeader } from "@/app/components/PageHeader";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

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
        gt(products.quantity, 0),
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
  return product;
};

export type fetchedProduct = Awaited<ReturnType<typeof fetchProductById>>;

export default async function ProductsPage({ params }: Params) {
  const { id } = await params;
  const product = await fetchProductById(id);
  if (!product) notFound();
  const t = await getTranslations("DetailsPage");
  const tb = await getTranslations("DetailsPage.Breadcrumbs");

  return (
    <>
      <PageHeader>{t("header")}</PageHeader>
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
