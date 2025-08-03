import { PageHeader } from "@/app/admin/_components/PageHeader";
import { db } from "@/drizzle/db";
import { categories } from "@/drizzle/schema";
import { eq } from "drizzle-orm";
import CategoryForm from "../../_components/CategoryForm";

export default async function EditCategoryPage({
  params,
}: {
  params: { id: number };
}) {
  const { id } = await params;

  const category = await db
    .select()
    .from(categories)
    .where(eq(categories.id, Number(id)))
    .limit(1);

  return (
    <>
      <PageHeader>Edit Category</PageHeader>
      <CategoryForm category={category[0]} />
    </>
  );
}
