import { StorefrontPageHeader } from "./components/StorefrontPageHeader";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
  const Metadata = await getTranslations("CartPage.Metadata");

  return {
    title: Metadata("title"),
    description: Metadata("description"),
  };
}

export type CategoryPageProps = {
  id: number;
  name: string;
  imageUrl: string;
};

export default async function CategoriesPage() {
  // const categories = await fetchActiveCategories();
  // const t = await getTranslations("CategoriesPage");
  return (
    <>
      <StorefrontPageHeader>Home Page</StorefrontPageHeader>
      {/* <CategoriesGrid categories={categories} /> */}
    </>
  );
}
