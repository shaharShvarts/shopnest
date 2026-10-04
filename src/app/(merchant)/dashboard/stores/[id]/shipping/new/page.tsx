import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { requireStoreManagementDb } from "@/lib/store-management/server";
import { createManagedShippingMethod } from "../../_actions/shipping";
import { ShippingMethodForm } from "../_components/ShippingMethodForm";

export default async function NewManagedShippingMethodPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let storeId: number;

  try {
    storeId = parseStoreId((await params).id);
  } catch {
    notFound();
  }

  const [{ store }, t] = await Promise.all([
    requireStoreManagementDb(storeId, "shipping.manage"),
    getTranslations("StoreShippingManagement"),
  ]);

  async function createAction(formData: FormData) {
    "use server";

    const result = await createManagedShippingMethod(storeId, formData);

    if (result.ok) {
      redirect(`/dashboard/stores/${storeId}/shipping`);
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <p className="text-sm text-muted-foreground">
          {store.displayName}
        </p>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("addMethod")}
        </h1>
      </header>

      <ShippingMethodForm action={createAction} />

      <div className="mx-auto mt-4 max-w-2xl">
        <Button asChild variant="outline" size="management">
          <Link href={`/dashboard/stores/${storeId}/shipping`}>
            {t("back")}
          </Link>
        </Button>
      </div>
    </main>
  );
}
