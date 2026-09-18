import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function DemoStoresSection() {
  const t = await getTranslations("Marketing");
  const stores = [
    ["/panda-pop", "examples.pandaPop"],
    ["/gift-shop", "examples.giftShop"],
    ["/dvorik-collection", "examples.dvorikCollection"],
  ] as const;
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <h2 className="text-3xl font-bold">{t("examples.title")}</h2>
      <p className="mt-3 text-muted-foreground">{t("examples.subtitle")}</p>
      <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
        {stores.map(([href, name]) => <article key={href} className="rounded-2xl border p-6"><h3 className="text-xl font-semibold">{t(name)}</h3><Link href={href} className="mt-4 inline-flex min-h-11 items-center font-semibold">{t("examples.viewStore")}</Link></article>)}
      </div>
    </section>
  );
}
