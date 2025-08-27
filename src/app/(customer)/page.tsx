import { db } from "@/drizzle/db";
import { cache } from "@/lib/cache";
import { eq, desc } from "drizzle-orm";
import { categories } from "@/drizzle/schema";
import { CategoryCard } from "../components/CategoryCard";
import { PageHeader } from "../admin/_components/PageHeader";

const fetchActiveCategories = cache(
  () => {
    return db
      .select({
        id: categories.id,
        name: categories.name,
        imageUrl: categories.imageUrl,
      })
      .from(categories)
      .where(eq(categories.isActive, true))
      .orderBy(desc(categories.name));
  },
  ["/categories", "getCategories"],
  { revalidate: 60 * 60 * 24 }
); // 24 hours

export default async function HomePage() {
  const categories = await fetchActiveCategories();

  return (
    <main className="space-y-12">
      {/* <h2 className="text-3xl font-bold underline">Categories</h2> */}
      <PageHeader>קטגוריות</PageHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((category) => (
          <CategoryCard key={category.id} {...category} />
        ))}
      </div>
    </main>
  );
}
