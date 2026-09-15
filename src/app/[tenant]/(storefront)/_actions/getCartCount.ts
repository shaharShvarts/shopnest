"use server";

import { getDb } from "@/drizzle/db";
import { carts, cartProducts } from "@/drizzle/schema";
import { and, eq, sql } from "drizzle-orm";
import { getCommerceIdentity } from "@/lib/customer-commerce/identity";

export async function getCartCount(): Promise<number> {
  const db = await getDb();
  const identity = await getCommerceIdentity();
  const cartBy = identity.customerAccountId
    ? eq(carts.customerAccountId, identity.customerAccountId)
    : identity.userId
      ? eq(carts.userId, identity.userId)
      : eq(carts.sessionId, identity.sessionId!);

  const [cart] = await db
    .select({ id: carts.id })
    .from(carts)
    .where(and(cartBy, eq(carts.isActive, true)))
    .limit(1);

  if (!cart) return 0;

  const [result] = await db
    .select({
      count: sql<number>`COALESCE(SUM(${cartProducts.quantity}), 0)`,
    })
    .from(cartProducts)
    .where(eq(cartProducts.cartId, cart.id));

  const count = Number(result?.count ?? 0);
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error("The cart count is outside the supported range.");
  }

  return count;
}
