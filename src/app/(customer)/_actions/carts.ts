"use server";

import z from "zod";
import type { AddToCartState } from "../products/_components/ProductDetails";
import {
  addProductToCart,
  deleteProductFromCart,
  fetchCartId,
  getProductPrice,
  reserveProduct,
  updateTotalPrice,
} from "./cartVerification";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

const productSchema = z.object({
  quantity: z.coerce.number().int().min(1, "Quantity must be at least 1"),
  productId: z.coerce
    .number()
    .int()
    .positive("Product ID must be a positive integer"),
});

export async function removeProduct(productId: number) {
  // 1. fetch the cart ID
  const cartId = await fetchCartId();
  if (!cartId) return;

  // 2. - Delete the item and get its quantity
  const quantity = await deleteProductFromCart(cartId, productId);

  // 3. Fetch the product price
  const product = await getProductPrice(productId);
  if (!product.success) return;

  // 4. Multiply and negate the total
  const itemTotal = -product.price * quantity;

  // 5. Update the cart’s total price
  await updateTotalPrice(cartId, itemTotal);

  revalidatePath("/");
  revalidatePath("/carts");
  return quantity;
}

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
  const userId = (await cookies()).get("user_id")?.value;
  const sessionId = (await cookies()).get("session_id")?.value;

  if (!userId && !sessionId)
    return {
      success: false,
      errors: { cart: ["unable to find the client"] },
    };

  // 1. Find or create cart by userId or sessionId
  const reservedProduct = await reserveProduct(productId);
  if (!reservedProduct)
    return {
      success: false,
      errors: { cart: ["This product cannot be reserved for the cart."] },
    };

  // 2. Find or create cart by userId or sessionId
  const cartId = await fetchCartId(userId, sessionId);

  if (!cartId)
    return {
      success: false,
      errors: { cart: ["Unable to create or fetch cart"] },
    };

  // 3. Add product to cart
  const cartProduct = await addProductToCart(productId, quantity, cartId);
  if (!cartProduct.success) return cartProduct;

  // 4. Get product price
  const product = await getProductPrice(productId);
  if (!product.success) return product;

  const itemTotal = product.price * quantity;

  const updataPrice = await updateTotalPrice(cartId, itemTotal);

  if (!updataPrice.success) return updataPrice;

  return {
    success: true,
    errors: {},
  };
}
