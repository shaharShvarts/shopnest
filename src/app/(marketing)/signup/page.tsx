import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getCurrentMerchant } from "@/lib/merchant-auth/server";
import { MarketingFooter } from "../_components/MarketingFooter";
import { MarketingHeader } from "../_components/MarketingHeader";
import { MerchantSignupForm } from "../_components/MerchantAuthForms";

export default async function Page() {
  if (await getCurrentMerchant()) redirect("/dashboard");
  const t = await getTranslations("MerchantAuth");

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
          <h1 className="text-3xl font-bold tracking-tight">{t("createAccount")}</h1>
          <p className="mb-6 mt-2 text-sm text-muted-foreground">{t("signupDetail")}</p>
          <MerchantSignupForm />
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
