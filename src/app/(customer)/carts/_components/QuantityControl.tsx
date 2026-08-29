"use client";

import { useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { updateProductQuantity } from "../../_actions/carts";
import { useCart } from "@/context/CartContext";
import { useTranslations } from "next-intl";

export function QuantityControl({
  productId,
  quantity,
  available,
}: {
  productId: number;
  quantity: number;
  available: number;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const { setCartCount } = useCart();
  const t = useTranslations("CartPage");

  const change = (next: number) => startTransition(async () => {
    setError(null);
    const result = await updateProductQuantity(productId, next);
    if (!result.success) {
      setError(result.error);
      return;
    }
    setCartCount((count) => Number(count) + result.quantityDelta);
    router.refresh();
  });

  return (
    <div>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" disabled={pending || quantity <= 1}
          aria-label="Decrease quantity" onClick={() => change(quantity - 1)}>
          <Minus aria-hidden="true" />
        </Button>
        <span className="min-w-8 text-center font-medium">{quantity}</span>
        <Button type="button" variant="outline" size="icon" disabled={pending || quantity >= available}
          aria-label="Increase quantity" onClick={() => change(quantity + 1)}>
          <Plus aria-hidden="true" />
        </Button>
      </div>
      {available < quantity && (
        <p className="mt-1 text-sm text-destructive" role="alert">
          {t("stock_available", { count: available })}
        </p>
      )}
      {error && <p className="mt-1 text-sm text-destructive" role="alert">{error}</p>}
    </div>
  );
}
