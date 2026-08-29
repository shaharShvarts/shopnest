import { eq } from "drizzle-orm";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { categories } from "@/drizzle/schema";
import CategoryForm from "../../_components/CategoryForm";
import { PageHeader } from "@/app/components/PageHeader";
import { notFound } from "next/navigation";

type EditCategoryProps = {
  params: Promise<{ id: number }>;
};

export default async function EditCategoryPage({ params }: EditCategoryProps) {
  const { id } = await params;
  const { db } = await requireTenantAdminDb();

  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, Number(id)))
    .limit(1);

  if (!category) notFound();

  return (
    <>
      <PageHeader>Edit Category</PageHeader>
      <CategoryForm category={category} />
    </>
  );
}
