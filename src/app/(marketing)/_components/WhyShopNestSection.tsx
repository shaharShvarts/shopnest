import { getTranslations } from "next-intl/server";

export async function WhyShopNestSection() {
  const t = await getTranslations("Marketing");
  const items = [
    ["why.setupTitle", "why.setupText"],
    ["why.localTitle", "why.localText"],
    ["why.secureTitle", "why.secureText"],
  ] as const;
  return (
    <section id="why-shopnest" className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="mb-10 max-w-2xl"><h2 className="text-3xl font-bold">{t("why.title")}</h2><p className="mt-3 text-muted-foreground">{t("why.subtitle")}</p></div>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {items.map(([title, text]) => <article key={title} className="rounded-2xl border p-6"><h3 className="text-xl font-semibold">{t(title)}</h3><p className="mt-3 text-muted-foreground">{t(text)}</p></article>)}
      </div>
    </section>
  );
}
