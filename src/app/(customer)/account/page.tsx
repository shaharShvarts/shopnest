import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TenantLink } from "@/components/TenantLink";
import { getCurrentCustomer } from "@/lib/customer-auth/server";
import { getTenant } from "@/lib/tenant-context";
import { logoutCustomerAction } from "./_actions";
import { Button } from "@/components/ui/button";

export default async function CustomerAccountPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/");
  const customer = await getCurrentCustomer();
  if (!customer) {
    redirect(
      `${tenant.basePath}/account/login?callback=${encodeURIComponent(`${tenant.basePath}/account`)}`
    );
  }
  const t = await getTranslations("CustomerAccount");
  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 py-4 sm:py-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("myAccount")}</h1>
        <p className="mt-2 text-muted-foreground">{t("accountSummary")}</p>
      </div>
      <section className="space-y-4 rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-7">
        <div><p className="text-sm text-muted-foreground">{t("name")}</p><p className="break-words font-medium">{customer.displayName || "—"}</p></div>
        <div><p className="text-sm text-muted-foreground">{t("email")}</p><p className="break-all font-medium">{customer.email}</p></div>
        <div><p className="text-sm text-muted-foreground">{t("currentStore")}</p><p className="font-medium">{tenant.slug}</p></div>
      </section>
      <TenantLink href="/account/orders" className="flex min-h-11 items-center justify-between rounded-xl bg-muted px-4 font-medium hover:bg-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span>{t("orders")}</span><span aria-hidden="true">→</span>
      </TenantLink>
      <form action={logoutCustomerAction}>
        <Button type="submit" variant="outline" className="min-h-11 w-full sm:w-auto">
          {t("logout")}
        </Button>
      </form>
    </div>
  );
}
