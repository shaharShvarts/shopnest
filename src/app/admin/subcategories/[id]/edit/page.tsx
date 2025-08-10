import { db } from "@/drizzle/db";
import { eq } from "drizzle-orm";
import { categories, subcategories } from "@/drizzle/schema";
import SubcategoryForm from "../../_components/SubcategoryForm";
import { PageHeader } from "@/app/admin/_components/PageHeader";

type EditSubcategoryProps = {
  params: Promise<{ id: number }>;
};

export default async function EditSubcategoryPage({
  params,
}: EditSubcategoryProps) {
  const { id } = await params;

  const [subcategoryResult, categoryList] = await Promise.all([
    db
      .select()
      .from(subcategories)
      .where(eq(subcategories.id, Number(id)))
      .limit(1),
    db.select().from(categories),
  ]);

  const subcategory = subcategoryResult[0];

  return (
    <>
      <PageHeader>Edit Subcategory</PageHeader>
      <SubcategoryForm subcategory={subcategory} categoryList={categoryList} />
    </>
  );
}
