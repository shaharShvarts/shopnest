"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon, LoaderCircle, Minus, Plus, ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCart } from "@/context/CartContext";
import { useTenant } from "@/context/TenantContext";
import { formatCurrency } from "@/lib/formatters";
import { resolveTenantImageUrl } from "@/lib/images/image-url.mjs";
import type { fetchedProduct } from "../[id]/details/page";

type ProductDetailsProps = {
  product: fetchedProduct;
};

export default function ProductDetails({ product }: ProductDetailsProps) {
  const [counter, setCounter] = useState(product.quantity > 0 ? 1 : 0);
  const [loading, setLoading] = useState(false);
  const { setCartCount } = useCart();
  const router = useRouter();
  const t = useTranslations("ProductDetails");
  const catalogT = useTranslations("CatalogUX");
  const tenant = useTenant();
  const normalizedImageUrl = resolveTenantImageUrl(
    product.imageUrl,
    tenant.slug
  );
  const stockMessage = product.customerStockMessage;
  const stockText =
    stockMessage.kind === "few_left"
      ? t("stockFew")
      : stockMessage.kind === "exact"
        ? t("stockExact", { count: stockMessage.quantity })
        : stockMessage.kind === "last_one"
          ? t("stockLast")
          : stockMessage.kind === "out_of_stock"
            ? t("stockOut")
            : null;
  const returnPath = product.subcategoryId
    ? `/categories/${product.categoryId}/subcategories/${product.subcategoryId}`
    : `/categories/${product.categoryId}/products`;

  return (
    <section className="mx-auto w-full max-w-7xl">
      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(22rem,0.85fr)] lg:items-start lg:gap-10">
        <div className="flex min-w-0 items-center justify-center overflow-hidden rounded-2xl bg-muted/70 p-3 sm:p-6">
          {normalizedImageUrl ? (
            <Image
              src={normalizedImageUrl}
              alt={product.name}
              width={900}
              height={900}
              unoptimized
              priority
              className="h-auto max-h-[72vh] w-full object-contain lg:max-h-[680px]"
              sizes="(min-width: 1024px) 58vw, 100vw"
            />
          ) : (
            <div className="flex min-h-72 w-full flex-col items-center justify-center gap-3 text-muted-foreground sm:min-h-[30rem]">
              <ImageIcon aria-hidden="true" className="size-12" />
              <span>{catalogT("imageUnavailable")}</span>
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-6 lg:sticky lg:top-28">
          <div className="space-y-4">
            <h1 className="break-words text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              {product.name}
            </h1>
            <p className="text-2xl font-bold tracking-tight sm:text-3xl">
              {formatCurrency(product.price)}
            </p>
            {stockText && (
              <p
                className={`font-semibold ${
                  product.quantity === 0 ? "text-destructive" : "text-amber-700"
                }`}
                role="status"
              >
                {stockText}
              </p>
            )}
          </div>

          {product.description && (
            <div className="space-y-2 border-t pt-5">
              <h2 className="font-semibold">{catalogT("description")}</h2>
              <p className="break-words text-sm leading-7 text-muted-foreground sm:text-base">
                {product.description}
              </p>
            </div>
          )}

          <div className="rounded-2xl bg-muted/60 p-4 sm:p-5">
            {product.quantity > 0 && (
              <div>
                <Label htmlFor="quantity" className="font-semibold">
                  {t("quantityLabel")}
                </Label>
                <div className="mt-3 flex items-center gap-2" dir="ltr">
                  <Button
                    type="button"
                    disabled={counter <= 1}
                    variant="outline"
                    size="icon"
                    className="size-11 rounded-xl bg-background"
                    aria-label={t("decreaseQuantity")}
                    onClick={() =>
                      setCounter((previous) => Math.max(1, previous - 1))
                    }
                  >
                    <Minus />
                  </Button>
                  <Input
                    type="number"
                    id="quantity"
                    name="quantity"
                    value={counter}
                    onChange={(event) => {
                      const value = event.currentTarget.valueAsNumber;
                      setCounter(
                        Number.isFinite(value)
                          ? Math.min(product.quantity, Math.max(1, value))
                          : 1
                      );
                    }}
                    min={1}
                    max={product.quantity}
                    className="h-11 w-20 rounded-xl bg-background text-center"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={counter >= product.quantity}
                    className="size-11 rounded-xl bg-background"
                    aria-label={t("increaseQuantity")}
                    onClick={() =>
                      setCounter((previous) =>
                        Math.min(product.quantity, previous + 1)
                      )
                    }
                  >
                    <Plus />
                  </Button>
                </div>
              </div>
            )}

            <Button
              type="button"
              size="lg"
              className="mt-5 min-h-12 w-full rounded-xl text-base"
              disabled={loading || counter === 0}
              onClick={async () => {
                setLoading(true);
                try {
                  const response = await fetch(tenant.path("/api/cart/add"), {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ productId: product.id, quantity: counter }),
                  });
                  const result = await response.json();
                  if (!response.ok) {
                    throw new Error(result.error || "Cart adding failed");
                  }

                  setCartCount((count) => count + counter);
                  toast.success(t("addToCartSuccess"), { position: "top-center" });
                  router.push(tenant.path(returnPath));
                } catch (error) {
                  toast.error(
                    error instanceof Error ? error.message : t("addToCartError"),
                    { position: "top-center" }
                  );
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <ShoppingBag aria-hidden="true" />
              )}
              {product.quantity === 0 ? t("stockOut") : t("addToCartButton")}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
