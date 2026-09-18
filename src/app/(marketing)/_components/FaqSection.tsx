import { getTranslations } from "next-intl/server";

export async function FaqSection() {
  const t = await getTranslations("Marketing");
  return (
    <section className="border-y bg-muted/30">
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold">{t("faq.title")}</h2>
        <div className="mt-8 divide-y rounded-2xl border bg-background px-5">
          {[1,2,3,4,5].map((item) => <details key={item} className="py-4"><summary className="min-h-11 cursor-pointer font-semibold">{t(`faq.q${item}`)}</summary><p className="pb-2 text-muted-foreground">{t(`faq.a${item}`)}</p></details>)}
        </div>
      </div>
    </section>
  );
}
