import Link from "next/link";
import { db } from "@/drizzle/db";
import { count, eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../../components/PageHeader";
import { SubcategoryTable } from "./_components/SubcategoryTable";
import { categories, products, subcategories } from "@/drizzle/schema";
import { Suspense } from "react";
import AdminLoading from "../loading";

export type SubcategoriesData = {
  isActive: boolean;
  subcategoryId: number;
  name: string;
  categoryName: string;
  productsCount: number;
};

export default async function AdminSubcategoriesPage() {
  const subcategoriesData: SubcategoriesData[] = await db
    .select({
      isActive: subcategories.isActive,
      subcategoryId: subcategories.id,
      name: subcategories.name,
      categoryName: categories.name,
      productsCount: count(products.id).as("productsCount"),
    })
    .from(subcategories)
    .leftJoin(products, eq(subcategories.id, products.categoryId))
    .innerJoin(categories, eq(subcategories.categoryId, categories.id))
    .groupBy(
      subcategories.id,
      subcategories.name,
      subcategories.isActive,
      categories.name
    )
    .orderBy(subcategories.name);

  return (
    <>
      <div className="flex justify-between items-center gap-4">
        <PageHeader>Subcategories</PageHeader>
        <Button asChild>
          <Link href="/admin/subcategories/new">Add subcategory</Link>
        </Button>
      </div>
      <Suspense fallback={<AdminLoading />}>
        <SubcategoryTable subcategoriesData={subcategoriesData} />
      </Suspense>
    </>
  );
}
