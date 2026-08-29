import { getTranslations } from "next-intl/server";
import { StorefrontPageHeader } from "../components/StorefrontPageHeader";
import { ShippingTable } from "./_components/ShippingTable";

export async function generateMetadata() {
  const Metadata = await getTranslations("CartPage.Metadata");

  return {
    title: Metadata("title"),
    description: Metadata("description"),
  };
}

export default async function ShippingPage() {
  const t = await getTranslations("ShippingPage");

  return (
    <>
      <StorefrontPageHeader>{t("header")}</StorefrontPageHeader>
      <ShippingTable />
    </>
  );
}
