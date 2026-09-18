import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MarketingFooter } from "../_components/MarketingFooter";
import { MarketingHeader } from "../_components/MarketingHeader";

export default async function Page() {
  const t = await getTranslations("Marketing");
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold tracking-tight">{t("placeholders.loginTitle")}</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">{t("placeholders.loginText")}</p>
        <Link href="/" className="mt-8 inline-flex min-h-11 items-center font-semibold">{t("placeholders.backHome")}</Link>
      </main>
      <MarketingFooter />
    </>
  );
}
