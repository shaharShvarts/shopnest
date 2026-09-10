import { StorefrontPageHeader } from "./components/StorefrontPageHeader";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { authorizeSuperAdmin } from "@/lib/admin-auth/core";
import { getCurrentAdminSession } from "@/lib/admin-auth/server";
import { getTenant } from "@/lib/tenant-context";

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
  // An anonymous request does not hit the database: session resolution returns
  // immediately when the HttpOnly admin cookie is absent.
  const tenant = await getTenant();
  const principal = tenant ? null : await getCurrentAdminSession();
  if (!tenant && authorizeSuperAdmin(principal)) redirect("/shopnest/admin");
  // const categories = await fetchActiveCategories();
  // const t = await getTranslations("CategoriesPage");
  return (
    <>
      <StorefrontPageHeader>Home Page</StorefrontPageHeader>
      {/* <CategoriesGrid categories={categories} /> */}
    </>
  );
}
