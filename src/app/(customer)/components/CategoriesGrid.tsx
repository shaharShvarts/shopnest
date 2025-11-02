// import { getTranslations } from "next-intl/server";

// import { PageHeader } from "@/app/components/PageHeader";
import { CategoryCard } from "@/app/components/CategoryCard";
import { CategoryPageProps } from "../page";

type CategoriesGridProps = {
  categories: CategoryPageProps[];
};

export default async function CategoriesGrid({
  categories,
}: CategoriesGridProps) {
  return (
    <main className="space-y-12">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map((category) => (
          <CategoryCard key={category.id} {...category} />
        ))}
      </div>
    </main>
  );
}
