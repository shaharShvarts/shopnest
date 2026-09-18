import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function FinalCtaSection() {
  const t = await getTranslations("Marketing");
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="rounded-3xl border p-8 text-center sm:p-12">
        <h2 className="text-3xl font-bold">{t("finalCta.title")}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">{t("finalCta.description")}</p>
        <Link href="/signup" className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-foreground">{t("finalCta.button")}</Link>
      </div>
    </section>
  );
}
