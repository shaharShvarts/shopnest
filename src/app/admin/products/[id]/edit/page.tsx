import { eq } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { categories, products } from "@/drizzle/schema";
import ProductForm from "../../_components/ProductForm";
import { PageHeader } from "@/app/components/PageHeader";

type EditCategoryProps = {
  params: Promise<{ id: number }>;
};

export default async function EditProductPage({ params }: EditCategoryProps) {
  const { id } = await params;

  const [productResult, categoryList] = await Promise.all([
    db
      .select()
      .from(products)
      .where(eq(products.id, Number(id)))
      .limit(1),
    db.select().from(categories),
  ]);

  const product = productResult[0];

  return (
    <>
      <PageHeader>Edit Product</PageHeader>
      <ProductForm product={product} categoryList={categoryList} />
    </>
  );
}
