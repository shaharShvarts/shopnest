import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/app/components/PageHeader";
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
      <PageHeader>{t("header")}</PageHeader>
      <ShippingTable />
    </>
  );
}
