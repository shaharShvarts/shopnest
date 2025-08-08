import { db } from "@/drizzle/db";
import { PageHeader } from "../../_components/PageHeader";
import SubcategoryForm from "../_components/SubcategoryForm";
import { categories } from "@/drizzle/schema";

export default async function NewSubcategoryPage() {
  const categoryList = await db.select().from(categories);

  return (
    <>
      <PageHeader>Add Subcategory</PageHeader>
      <SubcategoryForm categoryList={categoryList} />
    </>
  );
}
