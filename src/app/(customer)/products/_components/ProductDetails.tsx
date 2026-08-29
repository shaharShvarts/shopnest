"use client";

import Image from "next/image";
import { toast } from "react-toastify";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
// import { addToCart } from "../../_actions/carts";
import { useState } from "react";
import { useCart } from "@/context/CartContext";
import { useRouter } from "next/navigation";
import { fetchedProduct } from "../[id]/details/page";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTenant } from "@/context/TenantContext";
import { resolveTenantImageUrl } from "@/lib/images/image-url.mjs";

// const getProductQTY = async (productId: number) => {
//   const res = await fetch(`/api/reservations?productId=${productId}`, {
//     method: "GET",
//   });

//   if (!res.ok) {
//     if (res.status === 409) return res.json();
//     const errorData = await res.json();
//     console.log("Backend error:", errorData);

//     throw new Error(errorData.error || "Reservation failed");
//   }

//   return res.json();
// };

const addProductToCart = async (
  apiPath: string,
  productId: number,
  quantity: number
) => {
  const res = await fetch(apiPath, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, quantity }),
  });

  if (!res.ok) {
    const errorData = await res.json();
    console.log("Backend error:", errorData);

    throw new Error(errorData.error || "Cart adding failed");
  }

  return res.json();
};

type ProductDetailsProps = {
  product: fetchedProduct;
};

export default function ProductDetails({ product }: ProductDetailsProps) {
  const [counter, setCounter] = useState(product.quantity);
  const [loading, setLoading] = useState(false);

  // useEffect(() => {
  //   const fetchQuantity = async () => {
  //     try {
  //       const productQuantity = await getProductQTY(product.id);
  //       setCounter(productQuantity.quantity);
  //     } catch (error) {
  //       const err = error as Error;
  //       console.log(err.message || "Reservation error");
  //       alert(err.message || "Failed to reserve product. Please try again.");
  //     }
  //   };

  //   fetchQuantity();
  // }, [counter]);

  const { setCartCount } = useCart();
  const router = useRouter();
  const t = useTranslations("ProductDetails");
  const tenant = useTenant();
  const normalizedImageUrl = resolveTenantImageUrl(
    product.imageUrl,
    tenant.slug
  );

  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-2 lg:items-start lg:gap-8">
        <div className="flex min-w-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-muted p-2 sm:p-4">
          {normalizedImageUrl ? (
            <Image
              src={normalizedImageUrl}
              alt={product.name}
              width={720}
              height={720}
              unoptimized
              className="h-auto max-h-[70vh] w-full max-w-2xl object-contain lg:max-h-[560px]"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          ) : (
            <div className="flex min-h-64 w-full items-center justify-center text-muted-foreground sm:min-h-80">
              Image unavailable
            </div>
          )}
        </div>
        <div
          className={cn(
            "flex min-w-0 flex-col justify-start rounded-lg border border-gray-200 p-4 sm:p-6 lg:min-h-[420px]",
            counter === 0 ? " pointer-events-none opacity-50" : ""
          )}
        >
          <h2 className="mb-3 break-words text-2xl font-bold leading-tight text-gray-800 sm:text-3xl lg:text-4xl">
            {product.name}
          </h2>
          <p className="mb-5 text-base font-semibold text-gray-600 sm:text-lg">
            <span>{t("price")} </span>
            {new Intl.NumberFormat("he-IL", {
              style: "currency",
              currency: "ILS",
            }).format(product.price)}
          </p>
          <p className="mb-5 break-words text-sm leading-6 text-gray-700 sm:text-base sm:leading-7">
            {product.description}
          </p>

          {product.quantity > 1 && (
            <div className="mt-auto">
              <p className="text-sm text-gray-600 sm:text-base">
                {t("quantity", { count: product.quantity })}
              </p>
              <Label htmlFor="quantity" className="mt-4 block">
                {t("quantityLabel")}
              </Label>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  disabled={counter === 0}
                  variant="outline"
                  className="size-11 rounded-md border-2 border-black p-0"
                  aria-label="Decrease quantity"
                  onClick={() =>
                    setCounter((prev) => (prev > 1 ? prev - 1 : prev))
                  }
                >
                  <Minus />
                </Button>
                <Input
                  type="number"
                  id="quantity"
                  name="quantity"
                  disabled={counter === 0}
                  value={counter ?? 0} // fallback to 0 if undefined
                  onChange={(e) => setCounter(Number(e.target.value))}
                  min={1}
                  max={product.quantity}
                  className="h-11 w-16 appearance-none rounded-md !border-2 !border-black text-center focus-visible:ring-2"
                />
                <Button
                  variant="outline"
                  disabled={counter === 0}
                  className="size-11 rounded-md border-2 border-black p-0"
                  aria-label="Increase quantity"
                  onClick={() =>
                    setCounter((prev) =>
                      prev < product.quantity ? prev + 1 : prev
                    )
                  }
                >
                  <Plus />
                </Button>
              </div>
            </div>
          )}
          <Button
            className="mt-6 min-h-11 w-full sm:w-auto sm:min-w-52"
            disabled={loading || counter === 0}
            onClick={async () => {
              setLoading(true);
              try {
                await addProductToCart(
                  tenant.path("/api/cart/add"),
                  product.id,
                  counter
                );
                setCartCount((prev) => prev + counter);
                toast.success(t("addToCartSuccess"), {
                  position: "top-center",
                });
                router.push(
                  tenant.path(`/categories/${product.categoryId}/products`)
                );
              } catch (error) {
                const err = error as Error;
                console.log("Cart adding error:", err.message);
                alert(
                  err.message || "Failed to reserve product. Please try again."
                );
              } finally {
                setLoading(false);
              }
            }}
          >
            {t("addToCartButton")}
          </Button>
        </div>
      </div>
    </section>
  );
}
