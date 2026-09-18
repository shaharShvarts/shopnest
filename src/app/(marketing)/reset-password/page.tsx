import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { MarketingFooter } from "../_components/MarketingFooter";
import { MarketingHeader } from "../_components/MarketingHeader";
import { MerchantResetPasswordForm } from "../_components/MerchantAuthForms";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations("MerchantAuth");
  const token = (await searchParams).token?.trim() ?? "";

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
          <h1 className="text-3xl font-bold tracking-tight">{t("resetPassword")}</h1>
          <p className="mb-6 mt-2 text-sm text-muted-foreground">{t("resetPasswordDetail")}</p>
          {token ? (
            <MerchantResetPasswordForm token={token} />
          ) : (
            <div className="space-y-4">
              <p role="alert" className="text-sm text-destructive">{t("invalidResetLink")}</p>
              <Link href="/forgot-password" className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">
                {t("requestAnotherResetLink")}
              </Link>
            </div>
          )}
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
