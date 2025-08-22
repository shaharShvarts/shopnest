"use client";

import Image from "next/image";
import { useActionState, useEffect } from "react";
import { ProductPreview } from "../../types";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addToCart } from "../../_actions/carts";
import { toast } from "react-toastify";

type ProductDetailsProps = {
  product: ProductPreview;
};
//aspect-video
export default function ProductDetails({ product }: ProductDetailsProps) {
  const [state, formAction, isPending] = useActionState(
    addToCart.bind(null, product.id),
    {
      success: false,
      type: "addToCart",
      errors: {},
    }
  );

  useEffect(() => {
    if (state?.success) {
      toast.success(state.message || "Product added to cart!");
    } else if (state?.message) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-8">
      <div className="max-w-4xl mx-auto p-6">
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
                <span>Price: </span>
                {new Intl.NumberFormat("he-IL", {
                  style: "currency",
                  currency: "ILS",
                }).format(product.price)}
              </h3>
              <p className="text-gray-700 mb-4">{product.description}</p>
            </div>

            <div className="space-y-2">
              <p>The current quantity is: {product.quantity} </p>
              <Label htmlFor="quantity">Quantity</Label>
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
              {state.errors?.quantity && <p>{state.errors.quantity}</p>}
            </div>

            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Add to Cart"}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
