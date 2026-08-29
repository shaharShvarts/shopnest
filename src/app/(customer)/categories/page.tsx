import { getDbForTenant } from "@/drizzle/db";
import { cache } from "@/lib/cache";
import { and, desc, eq, isNull } from "drizzle-orm";
import { categories } from "@/drizzle/schema";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/app/components/PageHeader";
import CategoriesGrid from "../components/CategoriesGrid";
import { getTenant } from "@/lib/tenant-context";
import type { Tenant } from "@/lib/tenant";

export async function generateMetadata() {
  const Metadata = await getTranslations("CartPage.Metadata");

  return {
    title: Metadata("title"),
    description: Metadata("description"),
  };
}

const fetchActiveCategories = cache(
  async (tenant: Tenant | null) => {
    const db = getDbForTenant(tenant);
    return db
      .select({
        id: categories.id,
        name: categories.name,
        imageUrl: categories.imageUrl,
      })
      .from(categories)
      .where(and(eq(categories.isActive, true), isNull(categories.deletedAt)))
      .orderBy(desc(categories.name));
  },
  ["/categories", "getCategories"],
  { revalidate: 60 * 60 * 24 }
); // 24 hours

export type CategoryPageProps = Awaited<
  ReturnType<typeof fetchActiveCategories>
>[number];

export default async function CategoriesPage() {
  const categories = await fetchActiveCategories(await getTenant());
  const t = await getTranslations("CategoriesPage");
  return (
    <>
      <PageHeader>{t("header")}</PageHeader>
      <CategoriesGrid categories={categories} />
    </>
  );
}
