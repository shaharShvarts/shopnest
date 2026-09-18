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
        <h1 className="text-4xl font-bold tracking-tight">{t("examples.title")}</h1>
        <p className="mt-4 text-muted-foreground">{t("examples.subtitle")}</p>
        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
          {([
            ["/panda-pop", "examples.pandaPop"],
            ["/gift-shop", "examples.giftShop"],
            ["/dvorik-collection", "examples.dvorikCollection"],
          ] as const).map(([href, name]) => (
            <article key={href} className="rounded-2xl border p-6">
              <h2 className="text-xl font-semibold">{t(name)}</h2>
              <Link href={href} className="mt-4 inline-flex min-h-11 items-center font-semibold">{t("examples.viewStore")}</Link>
            </article>
          ))}
        </div>
        <Link href="/" className="mt-8 inline-flex min-h-11 items-center font-semibold">{t("placeholders.backHome")}</Link>
      </main>
      <MarketingFooter />
    </>
  );
}
