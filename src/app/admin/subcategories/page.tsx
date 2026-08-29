import { TenantLink as Link } from "@/components/TenantLink";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../../components/PageHeader";
import { SubcategoryTable } from "./_components/SubcategoryTable";
import { categories, products, subcategories } from "@/drizzle/schema";
import { Suspense } from "react";
import AdminLoading from "../loading";
import { countProductsBySubcategory } from "@/lib/catalog/counts";

export type SubcategoriesData = {
  isActive: boolean;
  subcategoryId: number;
  name: string;
  categoryName: string;
  productsCount: number;
};

export default async function AdminSubcategoriesPage() {
  const { db } = await requireTenantAdminDb();
  const [subcategoryRows, productRelations] = await Promise.all([
    db
      .select({
        isActive: subcategories.isActive,
        subcategoryId: subcategories.id,
        name: subcategories.name,
        categoryName: categories.name,
      })
      .from(subcategories)
      .innerJoin(categories, eq(subcategories.categoryId, categories.id))
      .orderBy(subcategories.name),
    db
      .select({
        categoryId: products.categoryId,
        subcategoryId: products.subcategoryId,
      })
      .from(products),
  ]);
  const productCounts = countProductsBySubcategory(productRelations);
  const subcategoriesData: SubcategoriesData[] = subcategoryRows.map(
    (subcategory) => ({
      ...subcategory,
      productsCount: productCounts.get(subcategory.subcategoryId) ?? 0,
    })
  );

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
