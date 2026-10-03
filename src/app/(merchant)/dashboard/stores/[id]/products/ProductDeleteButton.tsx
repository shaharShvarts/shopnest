"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast, type Id } from "react-toastify";
import { Button } from "@/components/ui/button";
import {
  deleteManagedProduct,
  undoManagedProductDelete,
} from "../_actions/catalog";

export function ProductDeleteButton({
  storeId,
  productId,
  deleteLabel,
  deletedMessage,
  undoLabel,
  deleteFailedMessage,
  undoFailedMessage,
}: {
  storeId: number;
  productId: number;
  deleteLabel: string;
  deletedMessage: string;
  undoLabel: string;
  deleteFailedMessage: string;
  undoFailedMessage: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function showUndoToast(undoVersion: string) {
    const toastId: Id = toast.info(
      <span className="flex items-center gap-3">
        <span>{deletedMessage}</span>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 font-semibold"
          onClick={() => {
            startTransition(async () => {
              const result = await undoManagedProductDelete(
                storeId,
                productId,
                undoVersion
              );

              toast.dismiss(toastId);

              if (!result.ok) {
                toast.error(undoFailedMessage);
                router.refresh();
                return;
              }

              router.refresh();
            });
          }}
        >
          {undoLabel}
        </Button>
      </span>,
      {
        autoClose: 10_000,
        closeOnClick: false,
        closeButton: false,
      }
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="management"
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await deleteManagedProduct(storeId, productId);

          if (!result.ok) {
            toast.error(deleteFailedMessage);
            return;
          }

          router.refresh();
          showUndoToast(result.undoVersion);
        });
      }}
      className="border-red-200 px-3 text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800"
    >
      {deleteLabel}
    </Button>
  );
}
