import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { CustomerRegisterForm } from "../_components/CustomerRegisterForm";
import { getCurrentCustomer } from "@/lib/customer-auth/server";
import { getTenant } from "@/lib/tenant-context";
import { resolveSafeTenantCallback } from "@/lib/customer-auth/core";
import { getGoogleOAuthConfiguration } from "@/lib/customer-auth/google-config";
import { GoogleLoginButton } from "../_components/GoogleLoginButton";

export default async function CustomerRegisterPage({ searchParams }: { searchParams: Promise<{ callback?: string }> }) {
  const tenant = await getTenant();
  if (!tenant) redirect("/");
  if (await getCurrentCustomer()) redirect(`${tenant.basePath}/account`);
  const t = await getTranslations("CustomerAccount");
  const callback = resolveSafeTenantCallback((await searchParams).callback, tenant.basePath);
  const googleEnabled = Boolean(getGoogleOAuthConfiguration(await headers()));
  return <div className="mx-auto w-full max-w-md py-6 sm:py-12"><section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8"><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("createAccount")}</h1><p className="mb-6 mt-2 text-sm text-muted-foreground">{t("accountOptional")}</p><div className="space-y-5"><GoogleLoginButton callback={callback} enabled={googleEnabled} /><CustomerRegisterForm callback={callback} /></div></section></div>;
}
