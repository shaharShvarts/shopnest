import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { getMerchantOrganizationRepository } from "@/lib/merchant-organizations/server";
import { StoreForm } from "../_components/StoreForm";

export default async function NewMerchantStorePage() {
  const merchant = await requireMerchantPage();
  const organization =
    await getMerchantOrganizationRepository().findFirstForMerchant(
      merchant.id
    );

  if (!organization) {
    redirect("/dashboard/business/new");
  }

  const t = await getTranslations("MerchantStore");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {t("createStoreTitle")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t("createStoreHelp")}
        </p>
      </header>

      <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <StoreForm mode="create" />
      </section>
    </main>
  );
}
