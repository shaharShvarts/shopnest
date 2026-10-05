import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { requireStoreManagementDb } from "@/lib/store-management/server";
import { createManagedShippingMethodForm } from "../../_actions/shipping";
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

  const [{ store, tenant }, t] = await Promise.all([
    requireStoreManagementDb(storeId, "shipping.manage"),
    getTranslations("StoreShippingManagement"),
  ]);

  const createAction = createManagedShippingMethodForm.bind(
    null,
    storeId
  );


  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <Link
          href={`/dashboard/stores/${storeId}/shipping`}
          className="mb-4 inline-block text-sm font-semibold text-blue-600 hover:underline"
        >
          {t("back")}
        </Link>
        <p className="text-sm text-muted-foreground">
          {store.displayName}
        </p>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("addMethod")}
        </h1>
      </header>

      <ShippingMethodForm
        action={createAction}
        tenantSlug={tenant.slug}
      />

    </main>
  );
}
