"use client";

import Image from "next/image";
import { toast } from "react-toastify";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
// import { addToCart } from "../../_actions/carts";
import { startTransition, useActionState, useEffect, useState } from "react";
import { useCart } from "@/context/CartContext";
import { useRouter } from "next/navigation";
import { fetchedProduct } from "../[id]/details/page";
import { useTranslations } from "next-intl";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

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

const addProductToCart = async (productId: number, quantity: number) => {
  const res = await fetch(`/api/cart/add`, {
    method: "POST",
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

  return (
    <div className="container mx-auto p-4">
      <div className="columns-2 xs:columns-1 gap-4">
        <div className="image-container mb-4 border-gray-200 border rounded-lg overflow-hidden">
          <Image
            src={product.imageUrl}
            alt={product.name}
            width={500}
            height={500}
            className="transition-transform duration-300 hover:scale-105"
            sizes="100vw"
          />
        </div>
        <div
          className={cn(
            "flex flex-col justify-start h-full border-gray-200 border rounded-lg overflow-hidden ",
            counter === 0 ? " pointer-events-none opacity-50" : ""
          )}
        >
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

          {product.quantity > 1 && (
            <>
              <p>{t("quantity", { count: product.quantity })}</p>
              <Label htmlFor="quantity" className="mt-4">
                {t("quantityLabel")}
              </Label>
              <div className="flex items-center space-x-2 mt-2">
                <Button
                  disabled={counter === 0}
                  variant="outline"
                  className="border-2 border-black py-4 rounded-none"
                  size="sm"
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
                  className="appearance-none w-[60px] text-center !border-2 !border-black !rounded-none focus-visible:outline-none focus-visible:ring-0 focus-visible:border-transparent"
                />
                <Button
                  variant="outline"
                  disabled={counter === 0}
                  className="border-2 border-black py-4 rounded-none"
                  size="sm"
                  onClick={() =>
                    setCounter((prev) =>
                      prev < product.quantity ? prev + 1 : prev
                    )
                  }
                >
                  <Plus />
                </Button>
              </div>
            </>
          )}
          <Button
            className="mt-6 w-[200px]"
            disabled={loading || counter === 0}
            onClick={async () => {
              setLoading(true);
              try {
                await addProductToCart(product.id, counter);
                setCartCount((prev) => prev + counter);
                toast.success(t("addToCartSuccess"), {
                  position: "top-center",
                });
                router.push(`/categories/${product.categoryId}/products`);
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
    </div>
  );
}
