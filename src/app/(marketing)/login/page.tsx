import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentMerchant } from "@/lib/merchant-auth/server";
import { MarketingFooter } from "../_components/MarketingFooter";
import { MarketingHeader } from "../_components/MarketingHeader";
import { MerchantLoginForm } from "../_components/MerchantAuthForms";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  if (await getCurrentMerchant()) redirect("/dashboard");
  const t = await getTranslations("MerchantAuth");
  const query = await searchParams;

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
          <h1 className="text-3xl font-bold tracking-tight">{t("signIn")}</h1>
          <p className="mb-6 mt-2 text-sm text-muted-foreground">{t("loginDetail")}</p>
          {query.reset === "success" && (
            <p role="status" className="mb-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
              {t("passwordResetComplete")}
            </p>
          )}
          <MerchantLoginForm />
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
