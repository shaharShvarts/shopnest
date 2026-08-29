import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { PageHeader } from "../../../components/PageHeader";
import SubcategoryForm from "../_components/SubcategoryForm";
import { categories } from "@/drizzle/schema";

export default async function NewSubcategoryPage() {
  const { db } = await requireTenantAdminDb();
  const categoryList = await db.select().from(categories);

  return (
    <>
      <PageHeader>Add Subcategory</PageHeader>
      <SubcategoryForm categoryList={categoryList} />
    </>
  );
}
