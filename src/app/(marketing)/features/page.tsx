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
        <h1 className="text-4xl font-bold tracking-tight">{t("capabilities.title")}</h1>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {(["storefront","catalog","checkout","payments","inventory","orders","shipping","accounts"] as const).map((key) => (
            <article key={key} className="rounded-2xl border p-6">
              <h2 className="text-xl font-semibold">{t(`capabilities.${key}Title`)}</h2>
              <p className="mt-3 text-muted-foreground">{t(`capabilities.${key}Text`)}</p>
            </article>
          ))}
        </div>
        <Link href="/" className="mt-8 inline-flex min-h-11 items-center font-semibold">{t("placeholders.backHome")}</Link>
      </main>
      <MarketingFooter />
    </>
  );
}
