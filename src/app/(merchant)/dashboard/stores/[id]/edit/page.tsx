import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { getMerchantStoreRepository } from "@/lib/merchant-stores/server";
import { StoreForm } from "../../_components/StoreForm";

export default async function EditMerchantStorePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const merchant = await requireMerchantPage();

  let id: number;
  try {
    id = parseStoreId((await params).id);
  } catch {
    notFound();
  }

  const store =
    await getMerchantStoreRepository().findOwnedById(
      merchant.id,
      id
    );

  if (!store) {
    notFound();
  }

  const t = await getTranslations("MerchantStore");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {t("editStoreTitle")}
        </h1>
        <p className="mt-2 text-muted-foreground">
          {t("editStoreHelp")}
        </p>
      </header>

      <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <StoreForm
          mode="edit"
          initialValues={{
            id: store.id,
            displayName: store.displayName,
            slug: store.slug,
            tenantId: store.tenantId,
            updatedAt: store.updatedAt.toISOString(),
          }}
        />
      </section>
    </main>
  );
}
