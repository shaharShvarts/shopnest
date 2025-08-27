"use server";

import z from "zod";
// import { redirect } from "next/navigation";
import { AddToCartState } from "../products/_components/ProductDetails";
import {
  addProductToCart,
  fetchCartId,
  getProductPrice,
  updateTotalPrice,
} from "./cartVerification";

const productSchema = z.object({
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  productId: z.coerce
    .number()
    .int()
    .positive("Product ID must be a positive integer"),
});

export async function addToCart(
  prevState: AddToCartState,
  formData: FormData
): Promise<AddToCartState> {
  const result = productSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  const { productId, quantity } = result.data;

  // 1. Find or create cart by userId or sessionId
  const cartId = await fetchCartId();

  if (!cartId)
    return {
      success: false,
      errors: { cart: ["Unable to create or fetch cart"] },
    };

  // 2. Add product to cart
  const cartProduct = await addProductToCart(productId, quantity, cartId);
  if (!cartProduct.success) return cartProduct;

  // 3. Get product price
  const product = await getProductPrice(productId);
  if (!product.success) return product;

  const itemTotal = product.price * quantity;

  const updataPrice = await updateTotalPrice(cartId, itemTotal);

  if (!updataPrice.success) return updataPrice;

  return {
    success: true,
    errors: {},
  };
  // redirect("/categories");
}
