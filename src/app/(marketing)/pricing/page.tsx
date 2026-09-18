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
        <h1 className="text-4xl font-bold tracking-tight">{t("pricing.title")}</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">{t("pricing.subtitle")}</p>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {(["free","small","medium","large"] as const).map((plan) => (
            <article key={plan} className="rounded-2xl border p-6">
              <h2 className="text-xl font-semibold">{t(`pricing.${plan}`)}</h2>
              <p className="mt-3 text-muted-foreground">{t(`pricing.${plan}Text`)}</p>
            </article>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">{t("pricing.pricingNote")}</p>
        <Link href="/" className="mt-8 inline-flex min-h-11 items-center font-semibold">{t("placeholders.backHome")}</Link>
      </main>
      <MarketingFooter />
    </>
  );
}
