import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/app/admin/_components/PageHeader";
import { CategoryCard } from "@/app/components/CategoryCard";

type CategoriesPageGridProps = {
  id: number;
  name: string;
  imageUrl: string;
};

export default async function CategoriesPageGrid({
  categories,
}: {
  categories: CategoriesPageGridProps[];
}) {
  const t = await getTranslations("CategoriesPage");

  return (
    <main className="space-y-12">
      <PageHeader>{t("header")}</PageHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((category) => (
          <CategoryCard key={category.id} {...category} />
        ))}
      </div>
    </main>
  );
}
