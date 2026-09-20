import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { getMerchantOrganizationRepository } from "@/lib/merchant-organizations/server";
import { OrganizationForm } from "../_components/OrganizationForm";

export default async function NewMerchantBusinessPage() {
  const merchant = await requireMerchantPage();
  const existing =
    await getMerchantOrganizationRepository().findFirstForMerchant(merchant.id);

  if (existing) {
    redirect("/dashboard/business");
  }

  const t = await getTranslations("MerchantOrganization");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          ShopNest
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          {t("createBusinessTitle")}
        </h1>
        <p className="mt-2 text-muted-foreground">{t("createBusinessHelp")}</p>
      </header>

      <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <OrganizationForm mode="create" />
      </section>
    </main>
  );
}
