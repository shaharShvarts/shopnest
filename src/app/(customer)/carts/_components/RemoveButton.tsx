"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { removeProduct } from "../../_actions/carts";
import { TableCell } from "@/components/ui";
import { CircleX } from "lucide-react";
import { useCart } from "@/context/CartContext";

export function RemoveButton({ productId }: { productId: number }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { setCartCount } = useCart();

  return (
    <button
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const quantity = await removeProduct(productId);
          if (!quantity) return;
          setCartCount((count) => Number(count) - quantity);
          router.refresh();
        });
      }}
    >
      <CircleX className="cursor-pointer" />
    </button>
  );
}
