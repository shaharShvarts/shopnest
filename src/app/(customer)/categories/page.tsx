import { getDbForTenant } from "@/drizzle/db";
import { cache } from "@/lib/cache";
import { and, desc, eq, isNull } from "drizzle-orm";
import { categories } from "@/drizzle/schema";
import { getTranslations } from "next-intl/server";
import { StorefrontPageHeader } from "../components/StorefrontPageHeader";
import CategoriesGrid from "../components/CategoriesGrid";
import { getTenant } from "@/lib/tenant-context";
import type { Tenant } from "@/lib/tenant";
import { notFound } from "next/navigation";

export async function generateMetadata() {
  const Metadata = await getTranslations("CartPage.Metadata");

  return {
    title: Metadata("title"),
    description: Metadata("description"),
  };
}

const fetchActiveCategories = cache(
  async (tenant: Tenant) => {
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
  const tenant = await getTenant();
  if (!tenant) notFound();
  const categories = await fetchActiveCategories(tenant);
  const t = await getTranslations("CategoriesPage");
  const catalogT = await getTranslations("CatalogUX");
  return (
    <div className="space-y-6 sm:space-y-8">
      <div>
        <StorefrontPageHeader>{t("header")}</StorefrontPageHeader>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          {catalogT("categoriesIntro")}
        </p>
      </div>
      {categories.length > 0 ? (
        <CategoriesGrid categories={categories} />
      ) : (
        <div className="rounded-2xl bg-muted/60 p-8 text-center sm:p-12">
          <h2 className="text-lg font-semibold">{catalogT("noCategories")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {catalogT("noCategoriesDetail")}
          </p>
        </div>
      )}
    </div>
  );
}
