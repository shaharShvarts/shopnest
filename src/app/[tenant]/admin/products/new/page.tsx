import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import ProductForm from "../_components/ProductForm";
import { categories } from "@/drizzle/schema";
import { AdminFormHeader } from "../../_components/AdminFormHeader";

export default async function NewProductPage() {
  const { db } = await requireTenantAdminDb();
  const categoryList = await db.select().from(categories);

  return (
    <>
      <AdminFormHeader
        title="Add Product"
        backHref="/admin/products"
        backLabel="Back to Products"
      />
      <ProductForm categoryList={categoryList} />
    </>
  );
}
