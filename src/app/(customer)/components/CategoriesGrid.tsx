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
    <section className="space-y-8 sm:space-y-12" aria-label="Catalog categories">
      <div className="grid min-w-0 grid-cols-1 gap-4 min-[430px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {categories.map((category) => (
          <CategoryCard key={category.id} {...category} />
        ))}
      </div>
    </section>
  );
}
