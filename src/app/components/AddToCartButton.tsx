"use client";

import { useState } from "react";
import { LoaderCircle, ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { useCart } from "@/context/CartContext";
import { useTenant } from "@/context/TenantContext";

export function AddToCartButton({
  productId,
  disabled = false,
}: {
  productId: number;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState(false);
  const { setCartCount } = useCart();
  const tenant = useTenant();
  const router = useRouter();
  const t = useTranslations("ProductDetails");

  return (
    <Button
      type="button"
      size="lg"
      className="min-h-11 w-full rounded-xl"
      disabled={disabled || pending}
      onClick={async () => {
        setPending(true);
        try {
          const response = await fetch(tenant.path("/api/cart/add"), {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productId, quantity: 1 }),
          });
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || "Cart adding failed");
          }

          setCartCount((count) => count + 1);
          toast.success(t("addToCartSuccess"), { position: "top-center" });
          router.refresh();
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : t("addToCartError"),
            { position: "top-center" }
          );
        } finally {
          setPending(false);
        }
      }}
    >
      {pending ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : (
        <ShoppingBag aria-hidden="true" />
      )}
      {disabled ? t("stockOut") : t("addToCartButton")}
    </Button>
  );
}
