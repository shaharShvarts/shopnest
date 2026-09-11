import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { eq } from "drizzle-orm";
import { categories, subcategories } from "@/drizzle/schema";
import SubcategoryForm from "../../_components/SubcategoryForm";
import { notFound } from "next/navigation";
import { AdminFormHeader } from "../../../_components/AdminFormHeader";

type EditSubcategoryProps = {
  params: Promise<{ id: number }>;
};

export default async function EditSubcategoryPage({
  params,
}: EditSubcategoryProps) {
  const { id } = await params;
  const { db } = await requireTenantAdminDb();

  const [subcategoryResult, categoryList] = await Promise.all([
    db
      .select()
      .from(subcategories)
      .where(eq(subcategories.id, Number(id)))
      .limit(1),
    db.select().from(categories),
  ]);

  const subcategory = subcategoryResult[0];
  if (!subcategory) notFound();

  return (
    <>
      <AdminFormHeader
        title="Edit Subcategory"
        backHref="/admin/subcategories"
        backLabel="Back to Subcategories"
      />
      <SubcategoryForm subcategory={subcategory} categoryList={categoryList} />
    </>
  );
}
