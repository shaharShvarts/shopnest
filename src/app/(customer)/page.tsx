import { db } from "@/drizzle/db";
import { cache } from "@/lib/cache";
import { eq, desc } from "drizzle-orm";
import { categories } from "@/drizzle/schema";
import CategoriesGrid from "./components/CategoriesGrid";
import { PageHeader } from "../admin/_components/PageHeader";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const Metadata = await getTranslations("CartPage.Metadata");

  return {
    title: Metadata("title"),
    description: Metadata("description"),
  };
}

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

export type CategoryPageProps = Awaited<
  ReturnType<typeof fetchActiveCategories>
>[number];

export default async function CategoriesPage() {
  const categories = await fetchActiveCategories();
  const t = await getTranslations("CategoriesPage");
  return (
    <>
      <PageHeader>{t("header")}</PageHeader>
      <CategoriesGrid categories={categories} />
    </>
  );
}
