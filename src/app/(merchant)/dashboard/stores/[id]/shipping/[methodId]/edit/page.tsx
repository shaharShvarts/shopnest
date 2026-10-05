import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { shippingMethods } from "@/drizzle/schema";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { requireStoreManagementDb } from "@/lib/store-management/server";
import { updateManagedShippingMethodForm } from "../../../_actions/shipping";
import { ShippingMethodForm } from "../../_components/ShippingMethodForm";

export default async function EditManagedShippingMethodPage({
  params,
}: {
  params: Promise<{ id: string; methodId: string }>;
}) {
  const resolved = await params;

  let storeId: number;
  let methodId: number;

  try {
    storeId = parseStoreId(resolved.id);
    methodId = Number(resolved.methodId);

    if (!Number.isSafeInteger(methodId) || methodId <= 0) {
      throw new Error("invalid method id");
    }
  } catch {
    notFound();
  }

  const [{ db, store, tenant }, t] = await Promise.all([
    requireStoreManagementDb(storeId, "shipping.manage"),
    getTranslations("StoreShippingManagement"),
  ]);

  const [method] = await db
    .select()
    .from(shippingMethods)
    .where(eq(shippingMethods.id, methodId))
    .limit(1);

  if (!method) {
    notFound();
  }

  const updateAction = updateManagedShippingMethodForm.bind(
    null,
    storeId,
    methodId
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
          {t("edit")}
        </h1>
      </header>

      <ShippingMethodForm
        action={updateAction}
        tenantSlug={tenant.slug}
        method={method}
      />

    </main>
  );
}
