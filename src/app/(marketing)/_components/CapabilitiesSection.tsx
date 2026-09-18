import { getTranslations } from "next-intl/server";

export async function CapabilitiesSection() {
  const t = await getTranslations("Marketing");
  const keys = ["storefront","catalog","checkout","payments","inventory","orders","shipping","accounts"] as const;
  return (
    <section className="border-y bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <h2 className="text-3xl font-bold">{t("capabilities.title")}</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {keys.map((key) => <article key={key} className="rounded-2xl border bg-background p-5"><h3 className="font-semibold">{t(`capabilities.${key}Title`)}</h3><p className="mt-2 text-sm text-muted-foreground">{t(`capabilities.${key}Text`)}</p></article>)}
        </div>
      </div>
    </section>
  );
}
