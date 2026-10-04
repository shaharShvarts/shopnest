import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { shippingMethods } from "@/drizzle/schema";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { requireStoreManagementDb } from "@/lib/store-management/server";
import { updateManagedShippingMethod } from "../../../_actions/shipping";
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

  const [{ db, store }, t] = await Promise.all([
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

  async function updateAction(formData: FormData) {
    "use server";

    const result = await updateManagedShippingMethod(
      storeId,
      methodId,
      formData
    );

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
          {t("edit")}
        </h1>
      </header>

      <ShippingMethodForm
        action={updateAction}
        method={method}
      />

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
