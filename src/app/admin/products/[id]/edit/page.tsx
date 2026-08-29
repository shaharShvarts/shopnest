import { eq } from "drizzle-orm";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { categories, products } from "@/drizzle/schema";
import ProductForm from "../../_components/ProductForm";
import { notFound } from "next/navigation";
import { AdminFormHeader } from "../../../_components/AdminFormHeader";

type EditCategoryProps = {
  params: Promise<{ id: number }>;
};

export default async function EditProductPage({ params }: EditCategoryProps) {
  const { id } = await params;
  const { db } = await requireTenantAdminDb();

  const [productResult, categoryList] = await Promise.all([
    db
      .select()
      .from(products)
      .where(eq(products.id, Number(id)))
      .limit(1),
    db.select().from(categories),
  ]);

  const product = productResult[0];
  if (!product) notFound();

  return (
    <>
      <AdminFormHeader
        title="Edit Product"
        backHref="/admin/products"
        backLabel="Back to Products"
      />
      <ProductForm product={product} categoryList={categoryList} />
    </>
  );
}
