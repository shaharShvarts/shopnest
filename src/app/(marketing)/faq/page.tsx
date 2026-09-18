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
        <h1 className="text-4xl font-bold tracking-tight">{t("faq.title")}</h1>
        <div className="mt-8 divide-y rounded-2xl border px-5">
          {[1,2,3,4,5].map((item) => (
            <details key={item} className="py-4">
              <summary className="min-h-11 cursor-pointer font-semibold">{t(`faq.q${item}`)}</summary>
              <p className="pb-2 text-muted-foreground">{t(`faq.a${item}`)}</p>
            </details>
          ))}
        </div>
        <Link href="/" className="mt-8 inline-flex min-h-11 items-center font-semibold">{t("placeholders.backHome")}</Link>
      </main>
      <MarketingFooter />
    </>
  );
}
