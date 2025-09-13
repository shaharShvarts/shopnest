import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/drizzle/db";
import AdminLoading from "../loading";
import { count, eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../../components/PageHeader";
import { CategoryTable } from "./_components/CategoryTable";
import { categories, products, subcategories } from "@/drizzle/schema";

export type CategoriesData = {
  isActive: boolean;
  categoryId: number;
  name: string;
  productsCount: number;
  subcategoriesCount: number;
};

export default async function AdminCategoriesPage() {
  const categoriesData: CategoriesData[] = await db
    .select({
      isActive: categories.isActive,
      categoryId: categories.id,
      name: categories.name,
      productsCount: count(products.id).as("productsCount"),
      subcategoriesCount: count(subcategories.id).as("subcategoriesCount"),
    })
    .from(categories)
    .leftJoin(products, eq(categories.id, products.categoryId))
    .leftJoin(subcategories, eq(categories.id, subcategories.categoryId))
    .groupBy(categories.id, categories.name, categories.isActive)
    .orderBy(categories.name);

  return (
    <>
      <div className="flex justify-between items-center gap-4">
        <PageHeader>Categories</PageHeader>
        <Button asChild>
          <Link href="/admin/categories/new">Add Category</Link>
        </Button>
      </div>

      <Suspense fallback={<AdminLoading />}>
        <CategoryTable categoriesData={categoriesData} />
      </Suspense>
    </>
  );
}
