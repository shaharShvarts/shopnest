import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { PageHeader } from "../../../components/PageHeader";
import ProductForm from "../_components/ProductForm";
import { categories } from "@/drizzle/schema";

export default async function NewProductPage() {
  const { db } = await requireTenantAdminDb();
  const categoryList = await db.select().from(categories);

  return (
    <>
      <PageHeader>Add Product</PageHeader>
      <ProductForm categoryList={categoryList} />
    </>
  );
}
