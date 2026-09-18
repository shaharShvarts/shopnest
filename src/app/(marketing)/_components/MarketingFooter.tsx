import Link from "next/link";
import { getTranslations } from "next-intl/server";

export async function MarketingFooter() {
  const t = await getTranslations("Marketing");
  return (
    <footer className="border-t">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div><p className="font-bold">ShopNest</p><p className="text-sm text-muted-foreground">{t("footer.tagline")}</p></div>
        <Link href="/admin/login" className="inline-flex min-h-11 items-center">{t("footer.admin")}</Link>
      </div>
    </footer>
  );
}
