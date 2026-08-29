import { TenantLink as Link } from "@/components/TenantLink";
import { Suspense } from "react";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import AdminLoading from "../loading";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../../components/PageHeader";
import { CategoryTable } from "./_components/CategoryTable";
import { categories, products, subcategories } from "@/drizzle/schema";
import {
  countProductsByCategory,
  countSubcategoriesByCategory,
} from "@/lib/catalog/counts";

export type CategoriesData = {
  isActive: boolean;
  categoryId: number;
  name: string;
  imageUrl: string;
  productsCount: number;
  subcategoriesCount: number;
};

export default async function AdminCategoriesPage() {
  const { db } = await requireTenantAdminDb();
  const [categoryRows, productRelations, subcategoryRelations] =
    await Promise.all([
      db
        .select({
          isActive: categories.isActive,
          categoryId: categories.id,
          name: categories.name,
          imageUrl: categories.imageUrl,
        })
        .from(categories)
        .orderBy(categories.name),
      db
        .select({
          categoryId: products.categoryId,
          subcategoryId: products.subcategoryId,
        })
        .from(products),
      db
        .select({ categoryId: subcategories.categoryId })
        .from(subcategories),
    ]);

  const productCounts = countProductsByCategory(productRelations);
  const subcategoryCounts = countSubcategoriesByCategory(
    subcategoryRelations
  );
  const categoriesData: CategoriesData[] = categoryRows.map((category) => ({
    ...category,
    productsCount: productCounts.get(category.categoryId) ?? 0,
    subcategoriesCount: subcategoryCounts.get(category.categoryId) ?? 0,
  }));

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
