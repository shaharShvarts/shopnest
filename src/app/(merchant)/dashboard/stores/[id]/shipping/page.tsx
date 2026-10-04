import Link from "next/link";
import { asc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { shippingMethods } from "@/drizzle/schema";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { requireStoreManagementDb } from "@/lib/store-management/server";
import {
  reorderManagedShippingMethods,
  toggleManagedShippingMethod,
} from "../_actions/shipping";

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
    .orderBy(asc(shippingMethods.sortOrder), asc(shippingMethods.name));

  async function toggleAction(formData: FormData) {
    "use server";

    const methodId = Number(formData.get("methodId"));
    const active = formData.get("active") === "true";

    await toggleManagedShippingMethod(storeId, methodId, active);
  }

  async function reorderAction(formData: FormData) {
    "use server";

    const methodId = Number(formData.get("methodId"));
    const direction = formData.get("direction");

    if (
      !Number.isSafeInteger(methodId) ||
      (direction !== "up" && direction !== "down")
    ) {
      return;
    }

    const orderedIds = methods.map((method) => method.id);
    const currentIndex = orderedIds.indexOf(methodId);

    if (currentIndex === -1) {
      return;
    }

    const targetIndex =
      direction === "up"
        ? currentIndex - 1
        : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= orderedIds.length) {
      return;
    }

    [orderedIds[currentIndex], orderedIds[targetIndex]] = [
      orderedIds[targetIndex],
      orderedIds[currentIndex],
    ];

    await reorderManagedShippingMethods(storeId, orderedIds);
  }

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
          <ul className="divide-y divide-border">
            {methods.map((method) => (
              <li
                key={method.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4"
              >
                <div>
                  <p className="font-semibold">{method.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    ₪{method.price} ·{" "}
                    {method.requiresAddress
                      ? t("addressRequired")
                      : t("addressNotRequired")}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <form action={reorderAction}>
                    <input type="hidden" name="methodId" value={method.id} />
                    <input type="hidden" name="direction" value="up" />
                    <Button
                      type="submit"
                      variant="outline"
                      size="management"
                      disabled={method.id === methods[0]?.id}
                    >
                      {t("moveUp")}
                    </Button>
                  </form>

                  <form action={reorderAction}>
                    <input type="hidden" name="methodId" value={method.id} />
                    <input type="hidden" name="direction" value="down" />
                    <Button
                      type="submit"
                      variant="outline"
                      size="management"
                      disabled={method.id === methods[methods.length - 1]?.id}
                    >
                      {t("moveDown")}
                    </Button>
                  </form>

                  <form action={toggleAction}>
                    <input type="hidden" name="methodId" value={method.id} />
                    <input
                      type="hidden"
                      name="active"
                      value={method.isActive ? "false" : "true"}
                    />
                    <Button type="submit" variant="outline" size="management">
                      {method.isActive ? t("disable") : t("enable")}
                    </Button>
                  </form>

                  <Button asChild variant="outline" size="management">
                    <Link
                      href={`/dashboard/stores/${storeId}/shipping/${method.id}/edit`}
                    >
                      {t("edit")}
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
