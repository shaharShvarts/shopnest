"use server";

import { db } from "@/drizzle/db";
import { cartProducts } from "@/drizzle/schema";
import { sql, eq } from "drizzle-orm";
import { verifyIdentification, getCartId } from "./cartVerification";

export async function getCartCount(): Promise<number> {
  const verify = await verifyIdentification();
  if (!verify.success) return 0;

  const { userId, sessionId } = verify.identification;
  const cartId = await getCartId(userId, sessionId);

  const [result] = await db
    .select({ count: sql<number>`SUM(quantity)` })
    .from(cartProducts)
    .where(eq(cartProducts.cartId, cartId));

  return result?.count ?? 0;
}
