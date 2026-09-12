import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import SubcategoryForm from "../_components/SubcategoryForm";
import { categories } from "@/drizzle/schema";
import { AdminFormHeader } from "../../_components/AdminFormHeader";

export default async function NewSubcategoryPage() {
  const { db } = await requireTenantAdminDb();
  const categoryList = await db.select().from(categories);

  return (
    <>
      <AdminFormHeader
        title="Add Subcategory"
        backHref="/admin/subcategories"
        backLabel="Back to Subcategories"
      />
      <SubcategoryForm categoryList={categoryList} />
    </>
  );
}
