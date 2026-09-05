// Compatibility component for the retired iCount prototype.
import { TenantLink } from "@/components/TenantLink";
import { getTranslations } from "next-intl/server";
export default async function CheckoutPageTest() {
  const t = await getTranslations("Payments");
  return <TenantLink href="/checkout">{t("goToCheckout")}</TenantLink>;
}
