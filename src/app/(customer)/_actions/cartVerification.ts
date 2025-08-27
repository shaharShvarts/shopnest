"use server";

import { db } from "@/drizzle/db";
import { carts, cartProducts, products } from "@/drizzle/schema";
import { eq, sql, and } from "drizzle-orm";
import { cookies } from "next/headers";

export async function fetchCartId() {
  const userId = (await cookies()).get("user_id")?.value;
  const sessionId = (await cookies()).get("session_id")?.value;

  if (!userId && !sessionId) return null;

  const cartBy = userId
    ? eq(carts.userId, Number(userId))
    : eq(carts.sessionId, sessionId!);

  const isActive = eq(carts.isActive, true);

  let [cart] = await db
    .select()
    .from(carts)
    .where(and(cartBy, isActive))
    .limit(1);

  if (!cart) {
    const [newCart] = await db
      .insert(carts)
      .values(userId ? { userId: Number(userId) } : { sessionId })
      .returning();
    cart = newCart;
  }

  return cart.id;
}

type ProductResult =
  | { success: true; status: number }
  | { success: false; errors: string };

export async function addProductToCart(
  productId: number,
  quantity: number,
  cartId: string
): Promise<ProductResult> {
  try {
    await db.insert(cartProducts).values({
      cartId,
      productId,
      quantity,
    });
    return { success: true, status: 201 };
  } catch (error) {
    const err = error as any;
    if (err.cause.code === "23505") {
      return {
        success: false,
        errors: "Product already exists in the cart",
      };
    }

    return {
      success: false,
      errors: "Failed to add product to cart",
    };
  }
}

type ProductPriceResult =
  | { success: true; price: number }
  | { success: false; errors: string };

export async function getProductPrice(
  productId: number
): Promise<ProductPriceResult> {
  const [product] = await db
    .select({ price: products.price })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);

  if (!product) {
    return { success: false, errors: "Product not found" };
  }

  return { success: true, price: product.price };
}

export async function updateTotalPrice(
  cartId: string,
  itemTotal: number
): Promise<ProductResult> {
  try {
    await db
      .update(carts)
      .set({
        totalPrice: sql`${carts.totalPrice} + ${itemTotal}`,
      })
      .where(eq(carts.id, cartId));
    return { success: true, status: 204 };
  } catch (error) {
    return {
      success: false,
      errors: "Failed to update cart total price",
    };
  }
}
