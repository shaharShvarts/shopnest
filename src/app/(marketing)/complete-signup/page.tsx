import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  inspectMerchantSignupToken,
} from "@/lib/merchant-auth/core";
import {
  getCurrentMerchant,
  getMerchantAuthRepository,
} from "@/lib/merchant-auth/server";
import { MarketingFooter } from "../_components/MarketingFooter";
import { MarketingHeader } from "../_components/MarketingHeader";
import {
  MerchantCompleteSignupForm,
  MerchantSignupResendForm,
} from "../_components/MerchantAuthForms";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const query = await searchParams;
  const token = query.token ?? "";
  const state = await inspectMerchantSignupToken(
    getMerchantAuthRepository(),
    token
  );

  if (state.kind === "completed") {
    const current = await getCurrentMerchant();
    if (current?.id === state.merchantId) {
      redirect("/dashboard");
    }
    redirect("/login");
  }

  const t = await getTranslations("MerchantAuth");

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
          {state.kind === "pending" ? (
            <>
              <h1 className="text-3xl font-bold tracking-tight">
                {t("completeSignup")}
              </h1>
              <p className="mb-6 mt-2 text-sm text-muted-foreground">
                {t("completeSignupDetail")}
              </p>
              <MerchantCompleteSignupForm token={token} />
            </>
          ) : state.kind === "expired" ? (
            <>
              <h1 className="text-3xl font-bold tracking-tight">
                {t("signupLinkExpired")}
              </h1>
              <p className="mb-6 mt-2 text-sm text-muted-foreground">
                {t("signupLinkExpiredIntro")}
              </p>
              <MerchantSignupResendForm
                token={token}
                email={maskEmail(state.email)}
              />
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold tracking-tight">
                {t("invalidSignupLink")}
              </h1>
              <p className="mb-6 mt-2 text-sm text-muted-foreground">
                {t("invalidSignupLinkDetail")}
              </p>
              <Link
                href="/signup"
                className="inline-flex min-h-11 items-center font-semibold underline underline-offset-4"
              >
                {t("startSignupAgain")}
              </Link>
            </>
          )}
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}

function maskEmail(email: string) {
  const at = email.indexOf("@");
  if (at <= 1) return email;
  return email.slice(0, 1) + "***" + email.slice(at);
}
