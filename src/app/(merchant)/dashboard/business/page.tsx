import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { getMerchantOrganizationRepository } from "@/lib/merchant-organizations/server";

export default async function MerchantBusinessPage() {
  const merchant = await requireMerchantPage();
  const organization =
    await getMerchantOrganizationRepository().findFirstForMerchant(merchant.id);

  if (!organization) {
    redirect("/dashboard/business/new");
  }

  const t = await getTranslations("MerchantOrganization");

  const details = [
    [t("businessName"), organization.displayName],
    [t("legalName"), organization.legalName],
    [t("businessNumber"), organization.businessNumber],
    [t("vatNumber"), organization.vatNumber],
    [t("email"), organization.email],
    [t("phone"), organization.phone],
    [t("country"), organization.country],
    [t("role"), t("owner")],
  ] as const;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {t("businessDetails")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("businessDetailsHelp")}</p>
      </header>

      <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <dl className="grid gap-5 sm:grid-cols-2">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className="text-sm font-medium text-muted-foreground">
                {label}
              </dt>
              <dd className="mt-1 break-words font-medium">
                {value || t("notAvailable")}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href="/dashboard/business/edit"
            className="min-h-11 rounded-lg bg-foreground px-5 py-2.5 font-semibold text-background"
          >
            {t("editBusiness")}
          </Link>
          <Link
            href="/dashboard"
            className="min-h-11 rounded-lg border border-border px-5 py-2.5 font-semibold"
          >
            {t("backToDashboard")}
          </Link>
        </div>
      </section>
    </main>
  );
}
