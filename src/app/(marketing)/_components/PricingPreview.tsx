import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function PricingPreview() {
  const t = await getTranslations("Marketing");
  const plans = ["free","small","medium","large"] as const;
  return (
    <section id="pricing" className="border-y bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="max-w-2xl"><h2 className="text-3xl font-bold">{t("pricing.title")}</h2><p className="mt-3 text-muted-foreground">{t("pricing.subtitle")}</p></div>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => <article key={plan} className="rounded-2xl border bg-background p-6"><h3 className="text-xl font-semibold">{t(`pricing.${plan}`)}</h3><p className="mt-3 text-sm text-muted-foreground">{t(`pricing.${plan}Text`)}</p></article>)}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">{t("pricing.pricingNote")}</p>
        <Link href="/pricing" className="mt-5 inline-flex min-h-11 items-center font-semibold">{t("nav.pricing")}</Link>
      </div>
    </section>
  );
}
