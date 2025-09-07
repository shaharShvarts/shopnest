// "use client";

// import { useTranslations } from "next-intl";
// import { PageHeader } from "@/app/admin/_components/PageHeader";
// import { CategoryCard } from "@/app/components/CategoryCard";
// import { setRequestLocale } from "next-intl/server";
// import { use } from "react";

// type HomePageGridProps = {
//   id: number;
//   name: string;
//   imageUrl: string;
// };

// export default function HomePageGrid({
//   categories,
//   params,
// }: {
//   categories: HomePageGridProps[];
//   params: Promise<{ locale: string }>;
// }) {
//   const { locale } = use(params);
//   setRequestLocale(locale);
//   const t = useTranslations("HomePage");

//   return (
//     <main className="space-y-12">
//       {/* <h2 className="text-3xl font-bold underline">Categories</h2> */}
//       <PageHeader>{t("title")}</PageHeader>
//       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
//         {categories.map((category) => (
//           <CategoryCard key={category.id} {...category} />
//         ))}
//       </div>
//     </main>
//   );
// }
