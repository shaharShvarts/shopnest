"use server";

import { cookies } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/drizzle/db";
import { cartProducts, carts, products } from "@/drizzle/schema";
import { getCartReservationDurationsMs } from "@/lib/inventory/config";
import { InventoryError, reserveCartInventoryInTransaction } from "@/lib/inventory/core";
import { DrizzleInventoryTransaction } from "@/lib/inventory/drizzle-store";
import { revalidateTenantPath } from "@/lib/tenant-context";

export async function removeProduct(productId: number) {
  const result = await mutateCartProduct(productId, 0);
  return result.success ? -result.quantityDelta : 0;
}

export async function updateProductQuantity(productId: number, quantity: number) {
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    return { success: false as const, error: "Quantity must be a positive whole number." };
  }
  return mutateCartProduct(productId, quantity);
}

async function mutateCartProduct(productId: number, targetQuantity: number) {
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    return { success: false as const, error: "Invalid product." };
  }
  const cookieStore = await cookies();
  const rawUserId = cookieStore.get("user_id")?.value;
  const sessionId = cookieStore.get("session_id")?.value;
  const userId = rawUserId ? Number(rawUserId) : null;
  if ((!userId && !sessionId) || (rawUserId && !Number.isSafeInteger(userId))) {
    return { success: false as const, error: "Unable to identify the cart owner." };
  }
  const ownerKey = userId ? `user:${userId}` : `session:${sessionId}`;
  const durations = getCartReservationDurationsMs();
  const db = await getDb();

  try {
    const result = await db.transaction(async (tx) => {
      const cartBy = userId ? eq(carts.userId, userId) : eq(carts.sessionId, sessionId!);
      const [cart] = await tx.select({ id: carts.id }).from(carts)
        .where(and(cartBy, eq(carts.isActive, true))).limit(1).for("update");
      if (!cart) throw new Error("No active cart was found.");

      const inventoryTx = new DrizzleInventoryTransaction(tx);
      await inventoryTx.lockReservationAttempt(cart.id);
      const currentItems = await tx.select({
        productId: cartProducts.productId,
        quantity: cartProducts.quantity,
      }).from(cartProducts).where(eq(cartProducts.cartId, cart.id));
      const current = currentItems.find((item) => item.productId === productId);
      if (!current) throw new Error("The product is not in this cart.");
      const nextItems = currentItems
        .map((item) => item.productId === productId ? { ...item, quantity: targetQuantity } : item)
        .filter((item) => item.quantity > 0);

      if (nextItems.length > 0) {
        await reserveCartInventoryInTransaction(inventoryTx, {
          ownerKey, cartId: cart.id, items: nextItems,
          idleDurationMs: durations.idleMs, maxDurationMs: durations.maxMs,
        });
      } else {
        await inventoryTx.markAttemptReservations(
          { ownerKey, cartId: cart.id, checkoutToken: cart.id, purpose: "cart" },
          "released",
          new Date()
        );
      }

      if (targetQuantity === 0) {
        await tx.delete(cartProducts).where(and(
          eq(cartProducts.cartId, cart.id), eq(cartProducts.productId, productId)
        ));
      } else {
        await tx.update(cartProducts).set({ quantity: targetQuantity, updatedAt: new Date() })
          .where(and(eq(cartProducts.cartId, cart.id), eq(cartProducts.productId, productId)));
      }
      const [total] = await tx.select({
        value: sql<number>`coalesce(sum(${cartProducts.quantity} * ${products.price}), 0)::int`,
      }).from(cartProducts).innerJoin(products, eq(cartProducts.productId, products.id))
        .where(eq(cartProducts.cartId, cart.id));
      await tx.update(carts).set({ totalPrice: Number(total.value), updatedAt: new Date() })
        .where(eq(carts.id, cart.id));
      return { quantityDelta: targetQuantity - current.quantity };
    });

    await revalidateTenantPath("/");
    await revalidateTenantPath("/carts");
    return { success: true as const, ...result };
  } catch (error) {
    const message = error instanceof InventoryError || error instanceof Error
      ? error.message
      : "Unable to update the cart.";
    return { success: false as const, error: message };
  }
}
