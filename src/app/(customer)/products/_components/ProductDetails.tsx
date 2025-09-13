"use client";

import Image from "next/image";
import { toast } from "react-toastify";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addToCart } from "../../_actions/carts";
import { startTransition, useActionState, useEffect } from "react";
import { useCart } from "@/context/CartContext";
import { useRouter } from "next/navigation";
import { fetchedProduct } from "../[id]/details/page";
import { useTranslations } from "next-intl";

type ProductDetailsProps = {
  product: fetchedProduct;
};

export type AddToCartState = {
  success: boolean;
  errors?: string | Record<string, string[]>;
};

export default function ProductDetails({ product }: ProductDetailsProps) {
  const [state, formAction, isPending] = useActionState<
    AddToCartState,
    FormData
  >(addToCart, {
    success: false,
    errors: {},
  });

  const { setCartCount } = useCart();
  const router = useRouter();
  const t = useTranslations("ProductDetails");

  useEffect(() => {
    if (state.success) {
      toast.success("Product added to cart!");
      startTransition(() => {
        setCartCount((count) => Number(count) + 1);
        router.push("/");
      });
    } else if (state.errors && Object.keys(state.errors).length > 0) {
      toast.error(
        typeof state.errors === "string"
          ? state.errors
          : Object.values(state.errors).flat().join(", ")
      );
    }
  }, [state]);

  return (
    <>
      <form action={formAction} className="space-y-8">
        <input type="hidden" name="productId" value={product.id.toString()} />
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            {/* <!-- Left Column: Image --> */}
            <div className="flex flex-col w-full">
              <Image
                src={product.imageUrl}
                alt={product.name}
                width={500}
                height={500}
                className="transition-transform duration-300 hover:scale-105"
                sizes="100vw"
              />
            </div>

            {/* <!-- Right Column: Content --> */}
            <div className="flex flex-col justify-between h-full">
              <div>
                <h1 className="text-3xl font-bold mb-2 text-gray-800">
                  {product.name}
                </h1>
                <h3 className="text-sm font-semibold text-gray-600 mb-6">
                  <span>{t("price")} </span>
                  {new Intl.NumberFormat("he-IL", {
                    style: "currency",
                    currency: "ILS",
                  }).format(product.price)}
                </h3>
                <p className="text-gray-700 mb-4">{product.description}</p>
              </div>

              <div className="space-y-2">
                {product.quantity > 1 && (
                  <p>{t("quantity", { count: product.quantity })}</p>
                )}
                <Label htmlFor="quantity" className="mt-4">
                  {t("quantityLabel")}
                </Label>
                <Input
                  type="number"
                  className="w-[200px]"
                  id="quantity"
                  required
                  name="quantity"
                  defaultValue={1}
                  min="1"
                  max={product.quantity}
                />
              </div>

              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : t("addToCartButton")}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
