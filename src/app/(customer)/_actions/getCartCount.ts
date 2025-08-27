"use server";

import { db } from "@/drizzle/db";
import { cartProducts } from "@/drizzle/schema";
import { sql, eq } from "drizzle-orm";
import { fetchCartId } from "./cartVerification";

export async function getCartCount(): Promise<number> {
  const cartId = await fetchCartId();

  if (!cartId) return 0;

  const [result] = await db
    .select({ count: sql<number>`SUM(quantity)` })
    .from(cartProducts)
    .where(eq(cartProducts.cartId, cartId));

  return result?.count ?? 0;
}
