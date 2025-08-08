import { eq } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { categories } from "@/drizzle/schema";
import CategoryForm from "../../_components/CategoryForm";
import { PageHeader } from "@/app/admin/_components/PageHeader";

type EditCategoryProps = {
  params: { id: number };
};

export default async function EditCategoryPage({ params }: EditCategoryProps) {
  const { id } = params;

  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, Number(id)))
    .limit(1);

  return (
    <>
      <PageHeader>Edit Category</PageHeader>
      <CategoryForm category={category} />
    </>
  );
}
