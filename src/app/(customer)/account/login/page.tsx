import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { CustomerLoginForm } from "../_components/CustomerLoginForm";
import { getCurrentCustomer } from "@/lib/customer-auth/server";
import { getTenant } from "@/lib/tenant-context";
import { resolveSafeTenantCallback } from "@/lib/customer-auth/core";
import { getGoogleOAuthConfiguration } from "@/lib/customer-auth/google-config";
import { GoogleLoginButton } from "../_components/GoogleLoginButton";

export default async function CustomerLoginPage({ searchParams }: { searchParams: Promise<{ callback?: string; reset?: string; oauth?: string }> }) {
  const tenant = await getTenant();
  if (!tenant) redirect("/");
  if (await getCurrentCustomer()) redirect(`${tenant.basePath}/account`);
  const t = await getTranslations("CustomerAccount");
  const query = await searchParams;
  const callback = resolveSafeTenantCallback(query.callback, tenant.basePath);
  const googleEnabled = Boolean(getGoogleOAuthConfiguration(await headers()));
  const oauthMessage = oauthMessageKey(query.oauth);
  return <div className="mx-auto w-full max-w-md py-6 sm:py-12"><section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8"><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("signIn")}</h1><p className="mb-6 mt-2 text-sm text-muted-foreground">{t("guestCheckout")}</p>{query.reset === "success" && <p role="status" className="mb-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{t("passwordResetComplete")}</p>}{oauthMessage && <p role="alert" className="mb-5 rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{t(oauthMessage)}</p>}<div className="space-y-5"><GoogleLoginButton callback={callback} enabled={googleEnabled} /><CustomerLoginForm callback={callback} /></div></section></div>;
}

function oauthMessageKey(value: string | undefined) {
  if (value === "cancelled") return "googleCancelled" as const;
  if (value === "unavailable") return "googleUnavailable" as const;
  if (value === "invalid") return "googleInvalid" as const;
  if (value === "failed") return "googleFailed" as const;
  return null;
}
