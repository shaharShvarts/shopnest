import { db } from "@/drizzle/db";
import { cache } from "@/lib/cache";
import { eq, desc } from "drizzle-orm";
import { categories } from "@/drizzle/schema";
import CategoriesPageGrid from "./components/CategoriesPageGrid";

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

export default async function CategoriesPage() {
  const categories = await fetchActiveCategories();
  return <CategoriesPageGrid categories={categories} />;
}
