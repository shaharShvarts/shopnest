import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { CustomerLoginForm } from "../_components/CustomerLoginForm";
import { getCurrentCustomer } from "@/lib/customer-auth/server";
import { getTenant } from "@/lib/tenant-context";
import { resolveSafeTenantCallback } from "@/lib/customer-auth/core";

export default async function CustomerLoginPage({ searchParams }: { searchParams: Promise<{ callback?: string; reset?: string }> }) {
  const tenant = await getTenant();
  if (!tenant) redirect("/");
  if (await getCurrentCustomer()) redirect(`${tenant.basePath}/account`);
  const t = await getTranslations("CustomerAccount");
  const query = await searchParams;
  const callback = resolveSafeTenantCallback(query.callback, tenant.basePath);
  return <div className="mx-auto w-full max-w-md py-6 sm:py-12"><section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8"><h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{t("signIn")}</h1><p className="mb-6 mt-2 text-sm text-muted-foreground">{t("guestCheckout")}</p>{query.reset === "success" && <p role="status" className="mb-5 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{t("passwordResetComplete")}</p>}<CustomerLoginForm callback={callback} /></section></div>;
}
