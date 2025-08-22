import { db } from "@/drizzle/db";
import { categories, Category } from "@/drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { Suspense } from "react";
import { cache } from "@/lib/cache";
import {
  CategoryCard,
  CategoryCardSkeleton,
} from "@/app/components/CategoryCard";

export type CategoryPreview = Pick<Category, "id" | "name" | "imageUrl">;

const getCategories = cache(
  () => {
    return db
      .select({
        id: categories.id,
        name: categories.name,
        imageUrl: categories.imageUrl,
      })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(desc(categories.name))
      .limit(6);
  },
  ["/categories", "getCategories"],
  { revalidate: 60 * 60 * 24 }
); // 24 hours

export default function CategoriesPage() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <Suspense
        fallback={Array.from({ length: 6 }).map((_, index) => (
          <CategoryCardSkeleton key={index} />
        ))}
      >
        <CategoriesSuspense />
      </Suspense>
    </div>
  );
}

async function CategoriesSuspense() {
  const categories = await getCategories();
  return categories.map((category) => (
    <CategoryCard key={category.id} {...category} />
  ));
}
