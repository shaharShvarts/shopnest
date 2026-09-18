import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function MarketingHeader() {
  const t = await getTranslations("Marketing");
  return (
    <header className="border-b bg-background/95">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="inline-flex min-h-11 items-center text-lg font-bold">ShopNest</Link>
        <nav aria-label="ShopNest marketing navigation" className="order-3 flex w-full flex-wrap items-center gap-4 text-sm lg:order-none lg:w-auto lg:gap-6">
          <Link href="/#why-shopnest">{t("nav.whyShopNest")}</Link>
          <Link href="/features">{t("nav.features")}</Link>
          <Link href="/pricing">{t("nav.pricing")}</Link>
          <Link href="/examples">{t("nav.examples")}</Link>
          <Link href="/faq">{t("nav.faq")}</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="inline-flex min-h-11 items-center px-3">{t("nav.login")}</Link>
          <Link href="/signup" className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-primary-foreground">{t("nav.startFree")}</Link>
        </div>
      </div>
    </header>
  );
}
