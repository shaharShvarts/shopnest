import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function HeroSection() {
  const t = await getTranslations("Marketing");
  return (
    <section id="hero" className="border-b">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-28">
        <div className="flex flex-col justify-center gap-6">
          <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">{t("hero.eyebrow")}</p>
          <h1 className="max-w-4xl text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">{t("hero.title")}</h1>
          <p className="max-w-2xl text-lg text-muted-foreground sm:text-xl">{t("hero.description")}</p>
          <div className="flex flex-wrap gap-3">
            <Link href="/signup" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 font-semibold text-primary-foreground">{t("hero.primaryCta")}</Link>
            <Link href="/examples" className="inline-flex min-h-11 items-center rounded-lg border px-5 font-semibold">{t("hero.secondaryCta")}</Link>
          </div>
        </div>
        <div aria-hidden="true" className="grid min-h-72 place-items-center rounded-3xl border bg-muted p-8">
          <div className="w-full max-w-sm rounded-2xl border bg-background p-5 shadow-sm">
            <div className="mb-5 h-3 w-24 rounded bg-muted-foreground/20" />
            <div className="grid grid-cols-2 gap-3">
              <div className="aspect-square rounded-xl bg-muted" />
              <div className="aspect-square rounded-xl bg-muted" />
              <div className="aspect-square rounded-xl bg-muted" />
              <div className="aspect-square rounded-xl bg-muted" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
