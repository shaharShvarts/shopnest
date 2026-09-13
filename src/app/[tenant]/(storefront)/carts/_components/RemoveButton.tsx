"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeProduct } from "../../_actions/carts";
import { CircleX } from "lucide-react";
import { useCart } from "@/context/CartContext";

export function RemoveButton({ productId }: { productId: number }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { setCartCount } = useCart();

  return (
    <button
      disabled={isPending}
      type="button"
      aria-label="Remove item from cart"
      className="flex size-11 shrink-0 items-center justify-center rounded-md text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive disabled:opacity-50"
      onClick={() => {
        startTransition(async () => {
          const quantity = await removeProduct(productId);
          if (!quantity) return;
          setCartCount((count) => Number(count) - quantity);
          router.refresh();
        });
      }}
    >
      <CircleX aria-hidden="true" />
    </button>
  );
}
