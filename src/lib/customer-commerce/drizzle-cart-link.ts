import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type { getDbForTenant } from "@/drizzle/db";
import { cartProducts, carts, products, reservations } from "@/drizzle/schema";
import { getCartReservationDurationsMs } from "@/lib/inventory/config";
import {
  calculateInventoryAvailability,
  reserveCartInventoryInTransaction,
  type ReservationAttemptIdentity,
} from "@/lib/inventory/core";
import { DrizzleInventoryTransaction } from "@/lib/inventory/drizzle-store";
import {
  mergeCartQuantities,
  type CustomerCartLinkStore,
} from "./cart-link";

type TenantDatabase = ReturnType<typeof getDbForTenant>;

export class DrizzleCustomerCartLinkStore implements CustomerCartLinkStore {
  constructor(private readonly database: TenantDatabase) {}

  linkGuestCart(input: { customerId: number; guestSessionId: string }) {
    return this.database.transaction(async (tx) => {
      const lockKeys = [
        `customer-cart:${input.customerId}`,
        `guest-cart:${input.guestSessionId}`,
      ].sort();
      for (const key of lockKeys) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`
        );
      }

      const [guestCart] = await tx
        .select({ id: carts.id })
        .from(carts)
        .where(
          and(
            eq(carts.sessionId, input.guestSessionId),
            eq(carts.isActive, true)
          )
        )
        .limit(1)
        .for("update");
      if (!guestCart) return { kind: "none" as const, adjustments: [] };

      const [accountCart] = await tx
        .select({ id: carts.id })
        .from(carts)
        .where(
          and(
            eq(carts.customerAccountId, input.customerId),
            eq(carts.isActive, true),
            ne(carts.id, guestCart.id)
          )
        )
        .limit(1)
        .for("update");

      const oldOwner = `session:${input.guestSessionId}`;
      const newOwner = `customer:${input.customerId}`;
      if (!accountCart) {
        await transferReservationOwnership(
          tx,
          guestCart.id,
          oldOwner,
          newOwner
        );
        await tx
          .update(carts)
          .set({
            customerAccountId: input.customerId,
            sessionId: null,
            updatedAt: new Date(),
          })
          .where(
            and(eq(carts.id, guestCart.id), eq(carts.isActive, true))
          );
        return { kind: "transferred" as const, adjustments: [] };
      }

      const inventoryTx = new DrizzleInventoryTransaction(tx);
      for (const cartId of [accountCart.id, guestCart.id].sort()) {
        await inventoryTx.lockReservationAttempt(cartId);
      }
      const [guestItems, accountItems] = await Promise.all([
        readCartItems(tx, guestCart.id),
        readCartItems(tx, accountCart.id),
      ]);
      const productIds = [
        ...new Set(
          [...guestItems, ...accountItems].map((item) => item.productId)
        ),
      ].sort((left, right) => left - right);
      const productRows =
        productIds.length === 0
          ? []
          : await tx
              .select({
                id: products.id,
                physical: products.quantity,
                price: products.price,
                lowStockThreshold: products.lowStockThreshold,
                criticalStockThreshold: products.criticalStockThreshold,
                isActive: products.isActive,
                isAvailable: products.isAvailable,
              })
              .from(products)
              .where(inArray(products.id, productIds))
              .orderBy(products.id)
              .for("update");

      const guestAttempt: ReservationAttemptIdentity = {
        checkoutToken: guestCart.id,
        cartId: guestCart.id,
        ownerKey: oldOwner,
        purpose: "cart",
      };
      const accountAttempt: ReservationAttemptIdentity = {
        checkoutToken: accountCart.id,
        cartId: accountCart.id,
        ownerKey: newOwner,
        purpose: "cart",
      };
      await assertAttemptOwnership(inventoryTx, guestAttempt);
      await assertAttemptOwnership(inventoryTx, accountAttempt);
      const otherTotals = await inventoryTx.getActiveReservationTotals(
        productIds,
        new Date(),
        [guestAttempt, accountAttempt]
      );
      const available = new Map(
        productRows.map((product) => [
          product.id,
          calculateInventoryAvailability(
            product,
            otherTotals.get(product.id) ?? 0
          ).available,
        ])
      );
      const merged = mergeCartQuantities(
        guestItems,
        accountItems,
        available
      );

      await inventoryTx.markAttemptReservations(
        guestAttempt,
        "released",
        new Date()
      );
      if (merged.items.length > 0) {
        const durations = getCartReservationDurationsMs();
        await reserveCartInventoryInTransaction(inventoryTx, {
          ownerKey: newOwner,
          cartId: accountCart.id,
          items: merged.items,
          idleDurationMs: durations.idleMs,
          maxDurationMs: durations.maxMs,
        });
      } else {
        await inventoryTx.markAttemptReservations(
          accountAttempt,
          "released",
          new Date()
        );
      }

      await tx.delete(cartProducts).where(eq(cartProducts.cartId, accountCart.id));
      if (merged.items.length > 0) {
        await tx.insert(cartProducts).values(
          merged.items.map((item) => ({ ...item, cartId: accountCart.id }))
        );
      }
      const priceByProduct = new Map(
        productRows.map((product) => [product.id, product.price])
      );
      const totalPrice = merged.items.reduce(
        (sum, item) => sum + item.quantity * (priceByProduct.get(item.productId) ?? 0),
        0
      );
      await tx
        .update(carts)
        .set({
          customerAccountId: input.customerId,
          sessionId: null,
          totalPrice,
          updatedAt: new Date(),
        })
        .where(eq(carts.id, accountCart.id));
      await tx
        .update(carts)
        .set({
          customerAccountId: input.customerId,
          sessionId: null,
          isActive: false,
          updatedAt: new Date(),
        })
        .where(and(eq(carts.id, guestCart.id), eq(carts.isActive, true)));

      return { kind: "merged" as const, adjustments: merged.adjustments };
    });
  }
}

async function readCartItems(
  tx: ConstructorParameters<typeof DrizzleInventoryTransaction>[0],
  cartId: string
) {
  return tx
    .select({
      productId: cartProducts.productId,
      quantity: cartProducts.quantity,
    })
    .from(cartProducts)
    .where(eq(cartProducts.cartId, cartId));
}

async function transferReservationOwnership(
  tx: ConstructorParameters<typeof DrizzleInventoryTransaction>[0],
  cartId: string,
  oldOwner: string,
  newOwner: string
) {
  const existing = await tx
    .select({
      ownerKey: reservations.ownerKey,
      cartId: reservations.cartId,
      purpose: reservations.purpose,
    })
    .from(reservations)
    .where(eq(reservations.checkoutToken, cartId))
    .for("update");
  if (
    existing.some(
      (row) =>
        row.ownerKey !== oldOwner ||
        row.cartId !== cartId ||
        row.purpose !== "cart"
    )
  ) {
    throw new Error("Guest cart reservations are bound to another owner.");
  }
  await tx
    .update(reservations)
    .set({ ownerKey: newOwner, updatedAt: new Date() })
    .where(
      and(
        eq(reservations.checkoutToken, cartId),
        eq(reservations.cartId, cartId),
        eq(reservations.ownerKey, oldOwner),
        eq(reservations.purpose, "cart")
      )
    );
}

async function assertAttemptOwnership(
  inventoryTx: DrizzleInventoryTransaction,
  attempt: ReservationAttemptIdentity
) {
  const rows = await inventoryTx.getAttemptReservations(attempt.checkoutToken);
  if (
    rows.some(
      (row) =>
        row.cartId !== attempt.cartId ||
        row.ownerKey !== attempt.ownerKey ||
        row.purpose !== attempt.purpose
    )
  ) {
    throw new Error("Cart reservations are bound to another owner.");
  }
}
