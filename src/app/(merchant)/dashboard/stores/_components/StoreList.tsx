"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast, type Id } from "react-toastify";
import {
  deleteStoreAction,
  undoStoreDeleteAction,
} from "../_actions";

export type StoreListItem = {
  id: number;
  displayName: string;
  slug: string;
  status: "draft" | "ready_for_provisioning" | "provisioned";
  tenantId: number | null;
  updatedAt: string;
};

export function StoreList({ stores }: { stores: StoreListItem[] }) {
  const t = useTranslations("MerchantStore");
  const router = useRouter();
  const [hiddenStoreIds, setHiddenStoreIds] = useState<Set<number>>(
    () => new Set()
  );
  const [storeVersions, setStoreVersions] = useState<Map<number, string>>(
    () => new Map(stores.map((store) => [store.id, store.updatedAt]))
  );

  function setHidden(storeId: number, hidden: boolean) {
    setHiddenStoreIds((current) => {
      const next = new Set(current);
      if (hidden) next.add(storeId);
      else next.delete(storeId);
      return next;
    });
  }

  async function handleDelete(store: StoreListItem) {
    if (store.tenantId !== null) {
      toast.warning(t("deleteBlocked"));
      return;
    }

    setHidden(store.id, true);

    const result = await deleteStoreAction({
      storeId: store.id,
      expectedUpdatedAt:
        storeVersions.get(store.id) ?? store.updatedAt,
    });

    if (!result.ok) {
      setHidden(store.id, false);
      toast.error(t(result.message));
      return;
    }

    showUndoToast(store.id, result.undoVersion);
  }

  function showUndoToast(storeId: number, undoVersion: string) {
    const toastId: Id = toast.info(
      <span className="flex items-center gap-3">
        <span>{t("storeDeleted")}</span>
        <button
          type="button"
          className="font-semibold underline"
          onClick={() =>
            void handleUndo(storeId, undoVersion, toastId)
          }
        >
          {t("undo")}
        </button>
      </span>,
      {
        autoClose: 10_000,
        closeOnClick: false,
      }
    );
  }

  async function handleUndo(
    storeId: number,
    undoVersion: string,
    toastId: Id
  ) {
    const result = await undoStoreDeleteAction({
      storeId,
      expectedUpdatedAt: undoVersion,
    });

    toast.dismiss(toastId);

    if (!result.ok) {
      toast.error(t(result.message));
      router.refresh();
      return;
    }

    setStoreVersions((current) => {
      const next = new Map(current);
      next.set(storeId, result.updatedAt);
      return next;
    });
    setHidden(storeId, false);
    router.refresh();
  }

  const visibleStores = stores.filter(
    (store) => !hiddenStoreIds.has(store.id)
  );

  return (
    <div className="mt-8 space-y-4">
      {visibleStores.map((store) => (
        <article
          key={store.id}
          className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold">
                {store.displayName}
              </h2>
              <p className="mt-1 font-mono text-sm text-muted-foreground">
                shopnest.co.il/{store.slug}
              </p>
              <p className="mt-2 text-sm font-medium">
                {t(store.status)}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={"/dashboard/stores/" + store.id}
                className="min-h-11 rounded-lg border border-border px-4 py-2 font-semibold"
              >
                {t("viewStore")}
              </Link>
              <Link
                href={"/dashboard/stores/" + store.id + "/edit"}
                className="min-h-11 rounded-lg border border-border px-4 py-2 font-semibold"
              >
                {t("editStore")}
              </Link>
              <button
                type="button"
                disabled={store.tenantId !== null}
                onClick={() => void handleDelete(store)}
                className="min-h-11 rounded-lg border border-destructive/30 px-4 py-2 font-semibold text-destructive disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("deleteStore")}
              </button>
            </div>
          </div>

          {store.tenantId !== null ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {t("deleteBlocked")}
            </p>
          ) : null}
        </article>
      ))}
    </div>
  );
}
