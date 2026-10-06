import Link from "next/link";
import { asc, isNull } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { shippingMethods } from "@/drizzle/schema";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { requireStoreManagementDb } from "@/lib/store-management/server";
import { ShippingMethodOrderList } from "./_components/ShippingMethodOrderList";

export default async function ManagedShippingPage({
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

  const [{ db, store }, t] = await Promise.all([
    requireStoreManagementDb(storeId, "shipping.manage"),
    getTranslations("StoreShippingManagement"),
  ]);

  const methods = await db
    .select()
    .from(shippingMethods)
    .where(isNull(shippingMethods.deletedAt))
    .orderBy(asc(shippingMethods.sortOrder), asc(shippingMethods.name));

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {store.displayName}
          </p>
          <h1 className="text-3xl font-bold tracking-tight">
            {t("title")}
          </h1>
        </div>

        <Button asChild size="management">
          <Link href={`/dashboard/stores/${storeId}/shipping/new`}>
            {t("addMethod")}
          </Link>
        </Button>
      </header>

      <div className="overflow-hidden rounded-2xl border border-border bg-background">
        {methods.length === 0 ? (
          <p className="p-6 text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <ShippingMethodOrderList
            storeId={storeId}
            initialMethods={methods}
          />
        )}
      </div>
    </main>
  );
}
