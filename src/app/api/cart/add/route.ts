import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/drizzle/db";
import { carts, cartProducts, categories, products, subcategories } from "@/drizzle/schema";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { InventoryError, reserveCartInventoryInTransaction } from "@/lib/inventory/core";
import { getCartReservationDurationsMs } from "@/lib/inventory/config";
import { DrizzleInventoryTransaction } from "@/lib/inventory/drizzle-store";

type RequestBody = { productId: number; quantity: number };

export async function POST(req: NextRequest) {
  const { productId, quantity } = (await req.json()) as RequestBody;
  if (!Number.isSafeInteger(productId) || productId <= 0 || !Number.isSafeInteger(quantity) || quantity <= 0) {
    return NextResponse.json({ error: "Product and quantity must be positive whole numbers." }, { status: 400 });
  }

  const userId = req.cookies.get("user_id")?.value;
  const sessionId = req.cookies.get("session_id")?.value;
  if (!userId && !sessionId) {
    return NextResponse.json({ error: "Missing user/session ID" }, { status: 400 });
  }
  const numericUserId = userId ? Number(userId) : null;
  if (userId && !Number.isSafeInteger(numericUserId)) {
    return NextResponse.json({ error: "Invalid user ID" }, { status: 400 });
  }
  const ownerKey = numericUserId ? `user:${numericUserId}` : `session:${sessionId}`;
  const db = await getDb();
  const durations = getCartReservationDurationsMs();

  try {
    const result = await db.transaction(async (tx) => {
      const [product] = await tx
        .select({ price: products.price })
        .from(products)
        .innerJoin(categories, eq(products.categoryId, categories.id))
        .leftJoin(subcategories, eq(products.subcategoryId, subcategories.id))
        .where(and(
          eq(products.id, productId), eq(products.isActive, true), eq(products.isAvailable, true),
          isNull(products.deletedAt), eq(categories.isActive, true), isNull(categories.deletedAt),
          or(isNull(products.subcategoryId), and(eq(subcategories.isActive, true), isNull(subcategories.deletedAt)))
        ))
        .limit(1);
      if (!product) throw new InventoryError("product_not_found", "Product not found", productId);

      const cartBy = numericUserId ? eq(carts.userId, numericUserId) : eq(carts.sessionId, sessionId!);
      let [cart] = await tx.select({ id: carts.id }).from(carts)
        .where(and(cartBy, eq(carts.isActive, true))).limit(1).for("update");
      if (!cart) {
        [cart] = await tx.insert(carts)
          .values(numericUserId ? { userId: numericUserId } : { sessionId })
          .returning({ id: carts.id });
      }

      const inventoryTx = new DrizzleInventoryTransaction(tx);
      await inventoryTx.lockReservationAttempt(cart.id);
      const currentItems = await tx.select({
        productId: cartProducts.productId,
        quantity: cartProducts.quantity,
      }).from(cartProducts).where(eq(cartProducts.cartId, cart.id));
      const existing = currentItems.find((item) => item.productId === productId);
      const requestedQuantity = (existing?.quantity ?? 0) + quantity;
      const reservationItems = [
        ...currentItems.filter((item) => item.productId !== productId),
        { productId, quantity: requestedQuantity },
      ];
      const reservation = await reserveCartInventoryInTransaction(inventoryTx, {
        ownerKey, cartId: cart.id, items: reservationItems,
        idleDurationMs: durations.idleMs, maxDurationMs: durations.maxMs,
      });

      await tx.insert(cartProducts).values({ cartId: cart.id, productId, quantity: requestedQuantity })
        .onConflictDoUpdate({
          target: [cartProducts.cartId, cartProducts.productId],
          set: { quantity: requestedQuantity, updatedAt: new Date() },
        });
      const [total] = await tx.select({
        value: sql<number>`coalesce(sum(${cartProducts.quantity} * ${products.price}), 0)::int`,
      }).from(cartProducts).innerJoin(products, eq(cartProducts.productId, products.id))
        .where(eq(cartProducts.cartId, cart.id));
      await tx.update(carts).set({ totalPrice: Number(total.value), updatedAt: new Date() })
        .where(eq(carts.id, cart.id));

      return {
        quantity: requestedQuantity,
        reservationExpiresAt: reservation.expiresAt,
        reservationMaxExpiresAt: reservation.maxExpiresAt,
      };
    });
    return NextResponse.json({ success: true, message: "Product added to cart", ...result });
  } catch (error) {
    if (error instanceof InventoryError) {
      return NextResponse.json({ error: error.message }, { status: error.code === "product_not_found" ? 404 : 409 });
    }
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
