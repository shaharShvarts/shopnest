import { getTranslations } from "next-intl/server";
import { MarketingFooter } from "../_components/MarketingFooter";
import { MarketingHeader } from "../_components/MarketingHeader";
import { MerchantForgotPasswordForm } from "../_components/MerchantAuthForms";

export default async function Page() {
  const t = await getTranslations("MerchantAuth");
  return (
    <>
      <MarketingHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
          <h1 className="text-3xl font-bold tracking-tight">{t("forgotPassword")}</h1>
          <p className="mb-6 mt-2 text-sm text-muted-foreground">{t("forgotPasswordDetail")}</p>
          <MerchantForgotPasswordForm />
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
