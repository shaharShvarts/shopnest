import { getTranslations } from "next-intl/server";

export async function HowItWorksSection() {
  const t = await getTranslations("Marketing");
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <h2 className="text-3xl font-bold">{t("how.title")}</h2>
      <ol className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
        {[1,2,3,4].map((step) => <li key={step} className="rounded-2xl border p-6"><span className="text-sm font-bold text-muted-foreground">{step}</span><h3 className="mt-3 text-lg font-semibold">{t(`how.step${step}Title`)}</h3><p className="mt-2 text-muted-foreground">{t(`how.step${step}Text`)}</p></li>)}
      </ol>
    </section>
  );
}
