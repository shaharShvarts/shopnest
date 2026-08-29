import {
  and,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  not,
  notInArray,
  sql,
} from "drizzle-orm";
import type { getDbForTenant } from "@/drizzle/db";
import {
  inventoryAlerts,
  products,
  reservations,
} from "@/drizzle/schema";
import type { InventoryAlertType } from "@/drizzle/schema/inventoryAlert";
import type { ReservationState } from "@/drizzle/schema/reservation";
import type {
  InventoryStore,
  InventoryTransaction,
  NewInventoryAlert,
  NewInventoryReservation,
  ReservationAttemptIdentity,
} from "./core";

type TenantDatabase = ReturnType<typeof getDbForTenant>;
type TenantTransaction = Parameters<
  Parameters<TenantDatabase["transaction"]>[0]
>[0];

const productSelection = {
  id: products.id,
  physical: products.quantity,
  lowStockThreshold: products.lowStockThreshold,
  criticalStockThreshold: products.criticalStockThreshold,
  isActive: products.isActive,
  isAvailable: products.isAvailable,
};

export class DrizzleInventoryStore implements InventoryStore {
  constructor(private readonly database: TenantDatabase) {}

  transaction<T>(
    callback: (tx: InventoryTransaction) => Promise<T>
  ): Promise<T> {
    return this.database.transaction((tx) =>
      callback(new DrizzleInventoryTransaction(tx))
    );
  }
}

export class DrizzleInventoryTransaction implements InventoryTransaction {
  constructor(private readonly tx: TenantTransaction) {}

  async getProducts(productIds: number[]) {
    if (productIds.length === 0) return [];
    return this.tx
      .select(productSelection)
      .from(products)
      .where(inArray(products.id, productIds))
      .orderBy(products.id);
  }

  async lockProducts(productIds: number[]) {
    if (productIds.length === 0) return [];
    return this.tx
      .select(productSelection)
      .from(products)
      .where(inArray(products.id, productIds))
      .orderBy(products.id)
      .for("update");
  }

  async lockReservationAttempt(checkoutToken: string) {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${checkoutToken}, 0))`
    );
  }

  async getActiveReservationTotals(
    productIds: number[],
    now: Date,
    excludeAttempt?: ReservationAttemptIdentity
  ) {
    if (productIds.length === 0) return new Map<number, number>();
    const conditions = [
      inArray(reservations.productId, productIds),
      eq(reservations.state, "active"),
      gt(reservations.expiresAt, now),
    ];
    if (excludeAttempt) {
      conditions.push(
        not(
          and(
            eq(reservations.checkoutToken, excludeAttempt.checkoutToken),
            eq(reservations.cartId, excludeAttempt.cartId),
            eq(reservations.ownerKey, excludeAttempt.ownerKey)
          )!
        )
      );
    }
    const rows = await this.tx
      .select({
        productId: reservations.productId,
        reserved: sql<number>`coalesce(sum(${reservations.quantity}), 0)::int`,
      })
      .from(reservations)
      .where(and(...conditions))
      .groupBy(reservations.productId);
    return new Map(
      rows.map((row) => [row.productId, Number(row.reserved)])
    );
  }

  async getAttemptReservations(checkoutToken: string) {
    return this.tx
      .select({
        id: reservations.id,
        ownerKey: reservations.ownerKey,
        cartId: reservations.cartId,
        checkoutToken: reservations.checkoutToken,
        productId: reservations.productId,
        quantity: reservations.quantity,
        state: reservations.state,
        expiresAt: reservations.expiresAt,
      })
      .from(reservations)
      .where(
        eq(reservations.checkoutToken, checkoutToken)
      )
      .orderBy(reservations.productId);
  }

  async upsertReservations(input: NewInventoryReservation[]) {
    for (const reservation of input) {
      await this.tx
        .insert(reservations)
        .values({
          ownerKey: reservation.ownerKey,
          purpose: "Checkout",
          productId: reservation.productId,
          quantity: reservation.quantity,
          cartId: reservation.cartId,
          checkoutToken: reservation.checkoutToken,
          state: "active",
          expiresAt: reservation.expiresAt,
          consumedAt: null,
          releasedAt: null,
        })
        .onConflictDoUpdate({
          target: [reservations.checkoutToken, reservations.productId],
          set: {
            purpose: "Checkout",
            quantity: reservation.quantity,
            state: "active",
            expiresAt: reservation.expiresAt,
            consumedAt: null,
            releasedAt: null,
            updatedAt: new Date(),
          },
        });
    }
  }

  async releaseAttemptReservationsExcept(
    attempt: ReservationAttemptIdentity,
    retainedProductIds: number[],
    now: Date
  ) {
    const conditions = [
      eq(reservations.checkoutToken, attempt.checkoutToken),
      eq(reservations.cartId, attempt.cartId),
      eq(reservations.ownerKey, attempt.ownerKey),
      eq(reservations.state, "active"),
    ];
    if (retainedProductIds.length > 0) {
      conditions.push(notInArray(reservations.productId, retainedProductIds));
    }
    await this.tx
      .update(reservations)
      .set({ state: "released", releasedAt: now, updatedAt: now })
      .where(and(...conditions));
  }

  async markAttemptReservations(
    attempt: ReservationAttemptIdentity,
    state: Exclude<ReservationState, "active">,
    now: Date
  ) {
    const timestamps =
      state === "consumed"
        ? { consumedAt: now }
        : { releasedAt: now };
    const rows = await this.tx
      .update(reservations)
      .set({ state, ...timestamps, updatedAt: now })
      .where(
        and(
          eq(reservations.checkoutToken, attempt.checkoutToken),
          eq(reservations.cartId, attempt.cartId),
          eq(reservations.ownerKey, attempt.ownerKey),
          eq(reservations.state, "active")
        )
      )
      .returning({ id: reservations.id });
    return rows.length;
  }

  async updateProductInventory(
    productId: number,
    input: {
      physical: number;
      lowStockThreshold: number;
      criticalStockThreshold: number;
    }
  ) {
    const rows = await this.tx
      .update(products)
      .set({
        quantity: input.physical,
        lowStockThreshold: input.lowStockThreshold,
        criticalStockThreshold: input.criticalStockThreshold,
      })
      .where(eq(products.id, productId))
      .returning({ id: products.id });
    if (rows.length !== 1) {
      throw new Error(`Product ${productId} changed during inventory update.`);
    }
  }

  async getUnresolvedAlerts(productId: number) {
    return this.tx
      .select({
        id: inventoryAlerts.id,
        productId: inventoryAlerts.productId,
        alertType: inventoryAlerts.alertType,
      })
      .from(inventoryAlerts)
      .where(
        and(
          eq(inventoryAlerts.productId, productId),
          isNull(inventoryAlerts.resolvedAt)
        )
      );
  }

  async resolveAlerts(
    productId: number,
    alertTypes: InventoryAlertType[],
    resolvedAt: Date
  ) {
    if (alertTypes.length === 0) return;
    await this.tx
      .update(inventoryAlerts)
      .set({ resolvedAt })
      .where(
        and(
          eq(inventoryAlerts.productId, productId),
          inArray(inventoryAlerts.alertType, alertTypes),
          isNull(inventoryAlerts.resolvedAt)
        )
      );
  }

  async createAlert(alert: NewInventoryAlert) {
    await this.tx.insert(inventoryAlerts).values(alert);
  }

  async cleanupExpiredReservations(now: Date) {
    const rows = await this.tx
      .update(reservations)
      .set({ state: "expired", releasedAt: now, updatedAt: now })
      .where(
        and(
          eq(reservations.state, "active"),
          lte(reservations.expiresAt, now)
        )
      )
      .returning({ id: reservations.id });
    return rows.length;
  }
}
