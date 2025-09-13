import { db } from "@/drizzle/db";
import { products } from "@/drizzle/schema";
import { desc, eq } from "drizzle-orm";
import ProductDetails from "../../_components/ProductDetails";
import DynamicBreadcrumb from "@/app/(customer)/components/Breadcrumb";
import { PageHeader } from "@/app/components/PageHeader";
import { getTranslations } from "next-intl/server";

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
    .where(eq(products.id, Number(id)))
    .limit(1);
  return product;
};

export type fetchedProduct = Awaited<ReturnType<typeof fetchProductById>>;

export default async function PurchasePage({ params }: Params) {
  const { id } = await params;
  const product = await fetchProductById(id);
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
