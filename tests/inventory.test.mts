import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  calculateInventoryAvailability,
  getInventoryStatus,
  getCustomerStockMessage,
  InventoryError,
  InventoryService,
  filterInventoryByStatus,
  summarizeInventoryHealth,
  validateInventoryThresholds,
  type InventoryAlertRecord,
  type InventoryProductRecord,
  type InventoryReservationRecord,
  type InventoryStore,
  type InventoryTransaction,
  type NewInventoryAlert,
  type NewInventoryReservation,
  type ReservationAttemptIdentity,
} from "../src/lib/inventory/core.ts";
import type { InventoryAlertType } from "../src/drizzle/schema/inventoryAlert.ts";
import type { ReservationState } from "../src/drizzle/schema/reservation.ts";

const t0 = new Date("2026-01-01T00:00:00.000Z");

test("quantity = 0 is valid and reports out_of_stock", () => {
  const availability = calculateInventoryAvailability(product(1, 0), 0);
  assert.equal(availability.available, 0);
  assert.equal(availability.status, "out_of_stock");
  assert.equal(availability.purchasable, false);
});

test("negative physical quantity is rejected", () => {
  assert.throws(
    () => calculateInventoryAvailability(product(1, -1), 0),
    (error: unknown) => inventoryCode(error, "invalid_quantity")
  );
});

test("Add to Cart creates a soft reservation in the protected transaction", async () => {
  const route = await source("../src/app/api/cart/add/route.ts");
  assert.match(route, /reserveCartInventoryInTransaction/);
  assert.match(route, /db\.transaction/);
  assert.match(route, /lockReservationAttempt/);
});

test("customer stock messaging follows the independent display policy", () => {
  const policy = { warningThreshold: 10, exactThreshold: 5 };
  assert.deepEqual(getCustomerStockMessage(11, policy), { kind: "none" });
  assert.deepEqual(getCustomerStockMessage(10, policy), { kind: "few_left" });
  assert.deepEqual(getCustomerStockMessage(5, policy), { kind: "exact", quantity: 5 });
  assert.deepEqual(getCustomerStockMessage(1, policy), { kind: "last_one" });
  assert.deepEqual(getCustomerStockMessage(0, policy), { kind: "out_of_stock" });
});

test("physical=10 and reserved=3 produces available=7", () => {
  const result = calculateInventoryAvailability(product(1, 10), 3);
  assert.deepEqual(
    { physical: result.physical, reserved: result.reserved, available: result.available },
    { physical: 10, reserved: 3, available: 7 }
  );
});

test("expired reservations do not reduce available stock", async () => {
  const store = inventoryStore(product(1, 10));
  store.reservations.push(reservation({ expiresAt: new Date(t0.getTime() - 1) }));
  const result = await new InventoryService(store).getAvailability(1, t0);
  assert.equal(result.reserved, 0);
  assert.equal(result.available, 10);
});

test("active non-expired reservations reduce available stock", async () => {
  const store = inventoryStore(product(1, 10));
  store.reservations.push(reservation({ quantity: 3 }));
  const result = await new InventoryService(store).getAvailability(1, t0);
  assert.equal(result.reserved, 3);
  assert.equal(result.available, 7);
});

test("cart soft reservation reduces availability for another cart", async () => {
  const store = inventoryStore(product(1, 3));
  const service = new InventoryService(store);
  await service.reserveCartInventory(cartHold(2));
  assert.equal((await service.getAvailability(1, t0)).available, 1);
  const ownView = await service.getAvailabilityBatchForCart(
    [1],
    { ownerKey: "owner-a", cartId: "cart-a" },
    t0
  );
  assert.equal(ownView.get(1)?.available, 3);
});

test("another owner cannot steal a cart soft reservation", async () => {
  const store = inventoryStore(product(1, 3));
  const service = new InventoryService(store);
  await service.reserveCartInventory(cartHold(1));
  await assert.rejects(
    service.reserveCartInventory(cartHold(2, later(1), "cart-a", "owner-b")),
    (error: unknown) => inventoryCode(error, "reservation_owner_mismatch")
  );
  assert.equal(store.reservations[0].ownerKey, "owner-a");
  assert.equal(store.reservations[0].quantity, 1);
});

test("two simultaneous cart holds cannot both reserve the final unit", async () => {
  const store = inventoryStore(product(1, 1));
  const service = new InventoryService(store);
  const results = await Promise.allSettled([
    service.reserveCartInventory(cartHold(1, t0, "cart-a", "owner-a")),
    service.reserveCartInventory(cartHold(1, t0, "cart-b", "owner-b")),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
});

test("soft reservation idle expiry releases stock logically without deleting cart data", async () => {
  const store = inventoryStore(product(1, 1));
  const service = new InventoryService(store);
  await service.reserveCartInventory(cartHold(1));
  assert.equal((await service.getAvailability(1, later(61))).available, 1);
  assert.equal(store.reservations.length, 1);
  const cartPage = await source("../src/app/(customer)/carts/page.tsx");
  assert.doesNotMatch(cartPage, /delete\(cartProducts\)/);
});

test("meaningful cart activity refreshes idle expiry", async () => {
  const store = inventoryStore(product(1, 2));
  const service = new InventoryService(store);
  const first = await service.reserveCartInventory(cartHold(1));
  const refreshed = await service.reserveCartInventory(cartHold(1, later(45)));
  assert.equal(first.expiresAt.toISOString(), later(60).toISOString());
  assert.equal(refreshed.expiresAt.toISOString(), later(105).toISOString());
  assert.equal(refreshed.lastActivityAt.toISOString(), later(45).toISOString());
});

test("passive availability reads do not extend a cart reservation", async () => {
  const store = inventoryStore(product(1, 2));
  const service = new InventoryService(store);
  await service.reserveCartInventory(cartHold(1));
  const expiresAt = store.reservations[0].expiresAt.toISOString();
  await service.getAvailability(1, later(30));
  assert.equal(store.reservations[0].expiresAt.toISOString(), expiresAt);
});

test("soft reservation refresh never exceeds its absolute maximum", async () => {
  const store = inventoryStore(product(1, 2));
  const service = new InventoryService(store);
  await service.reserveCartInventory(cartHold(1));
  await service.reserveCartInventory(cartHold(1, later(45)));
  const refreshed = await service.reserveCartInventory(cartHold(1, later(90)));
  assert.equal(refreshed.expiresAt.toISOString(), later(120).toISOString());
  assert.equal(refreshed.maxExpiresAt.toISOString(), later(120).toISOString());
});

test("increasing and decreasing cart quantity adjusts the same soft hold", async () => {
  const store = inventoryStore(product(1, 5));
  const service = new InventoryService(store);
  await service.reserveCartInventory(cartHold(2));
  await service.reserveCartInventory(cartHold(4, later(1)));
  assert.equal((await service.getAvailability(1, later(1))).available, 1);
  await service.reserveCartInventory(cartHold(1, later(2)));
  assert.equal((await service.getAvailability(1, later(2))).available, 4);
  assert.equal(store.reservations.length, 1);
});

test("removing a product releases its soft reservation immediately", async () => {
  const store = inventoryStore(product(1, 3), product(2, 3));
  const service = new InventoryService(store);
  await service.reserveCartInventory({
    ...cartHold(1),
    items: [{ productId: 1, quantity: 1 }, { productId: 2, quantity: 1 }],
  });
  await service.reserveCartInventory({ ...cartHold(1, later(1)), items: [{ productId: 2, quantity: 1 }] });
  assert.equal((await service.getAvailability(1, later(1))).available, 3);
  assert.equal((await service.getAvailability(2, later(1))).available, 2);
});

test("cart hold transitions to checkout without double counting", async () => {
  const store = inventoryStore(product(1, 5));
  const service = new InventoryService(store);
  await service.reserveCartInventory(cartHold(2));
  const hard = await service.transitionCartToCheckout(attempt("checkout-a", 2));
  assert.equal(hard.purpose, "checkout");
  assert.equal(hard.expiresAt.toISOString(), later(1).toISOString());
  assert.equal((await service.getAvailability(1, t0)).reserved, 2);
  assert.equal(store.reservations.filter((item) => item.state === "active").length, 1);
  assert.equal(store.reservations.find((item) => item.purpose === "cart")?.state, "released");
});

test("checkout refresh remains idempotent after cart transition", async () => {
  const store = inventoryStore(product(1, 5));
  const service = new InventoryService(store);
  await service.reserveCartInventory(cartHold(2));
  await service.transitionCartToCheckout(attempt("checkout-a", 2));
  await service.transitionCartToCheckout({ ...attempt("checkout-a", 2), now: later(1) });
  assert.equal(store.reservations.filter((item) => item.purpose === "checkout").length, 1);
  assert.equal((await service.getAvailability(1, later(1))).reserved, 2);
});

test("cannot reserve more than available inventory", async () => {
  const service = new InventoryService(inventoryStore(product(1, 2)));
  await assert.rejects(
    service.reserveInventory(attempt("attempt-a", 3)),
    (error: unknown) => inventoryCode(error, "insufficient_stock")
  );
});

test("two competing reservations cannot oversell the final unit", async () => {
  const store = inventoryStore(product(1, 1));
  const service = new InventoryService(store);
  const results = await Promise.allSettled([
    service.reserveInventory(attempt("attempt-a", 1, "cart-a", "owner-a")),
    service.reserveInventory(attempt("attempt-b", 1, "cart-b", "owner-b")),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal((await service.getAvailability(1, t0)).available, 0);
});

test("checkout refresh with the same token does not duplicate reservations", async () => {
  const store = inventoryStore(product(1, 5));
  const service = new InventoryService(store);
  await service.reserveInventory(attempt("attempt-a", 2));
  await service.reserveInventory(attempt("attempt-a", 2));
  assert.equal(store.reservations.length, 1);
  assert.equal((await service.getAvailability(1, t0)).reserved, 2);
});

test("the same checkout token cannot be reused for a different cart", async () => {
  const store = inventoryStore(product(1, 5));
  const service = new InventoryService(store);
  await service.reserveInventory(attempt("attempt-a", 2));
  await assert.rejects(
    service.reserveInventory(attempt("attempt-a", 1, "cart-b", "owner-a")),
    (error: unknown) => inventoryCode(error, "invalid_attempt")
  );
  assert.equal(store.reservations[0].cartId, "cart-a");
});

test("the same checkout token cannot be reused by a different owner", async () => {
  const store = inventoryStore(product(1, 5));
  const service = new InventoryService(store);
  await service.reserveInventory(attempt("attempt-a", 2));
  await assert.rejects(
    service.reserveInventory(attempt("attempt-a", 1, "cart-a", "owner-b")),
    (error: unknown) => inventoryCode(error, "reservation_owner_mismatch")
  );
  assert.equal(store.reservations[0].ownerKey, "owner-a");
});

test("an existing reservation cannot be stolen, moved, or reassigned", async () => {
  const store = inventoryStore(product(1, 5));
  const service = new InventoryService(store);
  await service.reserveInventory(attempt("attempt-a", 2));
  await assert.rejects(
    service.reserveInventory(attempt("attempt-a", 4, "cart-b", "owner-b"))
  );
  assert.deepEqual(
    {
      cartId: store.reservations[0].cartId,
      ownerKey: store.reservations[0].ownerKey,
      quantity: store.reservations[0].quantity,
      state: store.reservations[0].state,
    },
    { cartId: "cart-a", ownerKey: "owner-a", quantity: 2, state: "active" }
  );
});

test("failed cross-cart token reuse does not exclude the real reservation", async () => {
  const store = inventoryStore(product(1, 5));
  const service = new InventoryService(store);
  await service.reserveInventory(attempt("attempt-a", 2));
  await assert.rejects(
    service.reserveInventory(attempt("attempt-a", 4, "cart-b", "owner-a"))
  );
  const availability = await service.getAvailability(1, t0);
  assert.equal(availability.reserved, 2);
  assert.equal(availability.available, 3);
});

test("an expired reservation can be replaced by a new reservation", async () => {
  const store = inventoryStore(product(1, 1));
  const service = new InventoryService(store);
  await service.reserveInventory({ ...attempt("attempt-a", 1), durationMs: 1_000 });
  await service.reserveInventory({
    ...attempt("attempt-b", 1, "cart-b", "owner-b"),
    now: new Date(t0.getTime() + 1_001),
  });
  assert.equal(store.reservations.length, 2);
});

test("consuming a reservation decreases physical inventory", async () => {
  const store = inventoryStore(product(1, 5));
  const service = new InventoryService(store);
  await service.reserveInventory(attempt("attempt-a", 2));
  await service.consumeReservation(consume("attempt-a"));
  assert.equal(store.products.get(1)?.physical, 3);
  assert.equal(store.reservations[0].state, "consumed");
});

test("consuming a reservation cannot make physical stock negative", async () => {
  const store = inventoryStore(product(1, 1));
  const service = new InventoryService(store);
  await service.reserveInventory(attempt("attempt-a", 1));
  store.products.get(1)!.physical = 0;
  await assert.rejects(
    service.consumeReservation(consume("attempt-a")),
    (error: unknown) => inventoryCode(error, "insufficient_stock")
  );
  assert.equal(store.reservations[0].state, "active");
});

test("11 to 10 creates one low_stock alert", async () => {
  const store = inventoryStore(product(1, 11));
  await new InventoryService(store).adjustInventory(1, { physical: 10, now: t0 });
  assert.deepEqual(store.alerts.map((alert) => alert.alertType), ["low_stock"]);
});

test("staying low from 10 to 9 does not duplicate low_stock", async () => {
  const store = inventoryStore(product(1, 11));
  const service = new InventoryService(store);
  await service.adjustInventory(1, { physical: 10, now: t0 });
  await service.adjustInventory(1, { physical: 9, now: later(1) });
  assert.equal(activeAlerts(store, "low_stock").length, 1);
});

test("5 to 4 creates a critical_stock alert", async () => {
  const store = inventoryStore(product(1, 5));
  await new InventoryService(store).adjustInventory(1, { physical: 4, now: t0 });
  assert.deepEqual(store.alerts.map((alert) => alert.alertType), ["critical_stock"]);
});

test("staying critical does not duplicate critical_stock", async () => {
  const store = inventoryStore(product(1, 5));
  const service = new InventoryService(store);
  await service.adjustInventory(1, { physical: 4, now: t0 });
  await service.adjustInventory(1, { physical: 3, now: later(1) });
  assert.equal(activeAlerts(store, "critical_stock").length, 1);
});

test("1 to 0 creates an out_of_stock alert", async () => {
  const store = inventoryStore(product(1, 1));
  await new InventoryService(store).adjustInventory(1, { physical: 0, now: t0 });
  assert.deepEqual(store.alerts.map((alert) => alert.alertType), ["out_of_stock"]);
});

test("severity transitions retain history but keep only one unresolved alert", async () => {
  const store = inventoryStore(product(1, 11));
  const service = new InventoryService(store);

  await service.adjustInventory(1, { physical: 10, now: t0 });
  assert.deepEqual(unresolvedAlertTypes(store), ["low_stock"]);

  await service.adjustInventory(1, { physical: 4, now: later(1) });
  assert.deepEqual(unresolvedAlertTypes(store), ["critical_stock"]);
  assert.equal(store.alerts.find((alert) => alert.alertType === "low_stock")?.resolvedAt instanceof Date, true);

  await service.adjustInventory(1, { physical: 0, now: later(2) });
  assert.deepEqual(unresolvedAlertTypes(store), ["out_of_stock"]);
  assert.equal(store.alerts.find((alert) => alert.alertType === "critical_stock")?.resolvedAt instanceof Date, true);

  await service.adjustInventory(1, { physical: 30, now: later(3) });
  assert.deepEqual(unresolvedAlertTypes(store), []);
  assert.equal(store.alerts.length, 3);
  assert.equal(store.alerts.every((alert) => alert.resolvedAt instanceof Date), true);
});

test("a product never has multiple unresolved severity alerts", async () => {
  const store = inventoryStore(product(1, 11));
  const service = new InventoryService(store);
  for (const [index, physical] of [10, 9, 4, 3, 0, 4, 10, 30].entries()) {
    await service.adjustInventory(1, {
      physical,
      now: later(index),
    });
    assert.ok(
      store.alerts.filter((alert) => alert.resolvedAt === null).length <= 1
    );
  }
});

test("restocking 4 to 30 resolves applicable alerts", async () => {
  const store = inventoryStore(product(1, 11));
  const service = new InventoryService(store);
  await service.adjustInventory(1, { physical: 10, now: t0 });
  await service.adjustInventory(1, { physical: 4, now: later(1) });
  await service.adjustInventory(1, { physical: 30, now: later(2) });
  assert.equal(store.alerts.every((alert) => alert.resolvedAt instanceof Date), true);
});

test("after restock a later drop can create a new low_stock alert", async () => {
  const store = inventoryStore(product(1, 11));
  const service = new InventoryService(store);
  await service.adjustInventory(1, { physical: 10, now: t0 });
  await service.adjustInventory(1, { physical: 30, now: later(1) });
  await service.adjustInventory(1, { physical: 10, now: later(2) });
  assert.equal(store.alerts.filter((alert) => alert.alertType === "low_stock").length, 2);
  assert.equal(activeAlerts(store, "low_stock").length, 1);
});

test("tenant inventory stores are isolated", async () => {
  const giftShop = new InventoryService(inventoryStore(product(1, 2)));
  const pandaPop = new InventoryService(inventoryStore(product(1, 2)));
  await giftShop.reserveInventory(attempt("gift-attempt", 2));
  assert.equal((await giftShop.getAvailability(1, t0)).available, 0);
  assert.equal((await pandaPop.getAvailability(1, t0)).available, 2);
});

test("the same cart ID in another tenant cannot affect the first tenant", async () => {
  const giftStore = inventoryStore(product(1, 2));
  const pandaStore = inventoryStore(product(1, 2));
  await new InventoryService(giftStore).reserveCartInventory(cartHold(2));
  await new InventoryService(pandaStore).reserveCartInventory(cartHold(1));
  assert.equal((await new InventoryService(giftStore).getAvailability(1, t0)).available, 0);
  assert.equal((await new InventoryService(pandaStore).getAvailability(1, t0)).available, 1);
});

test("admin cannot reduce physical stock below all active soft and hard reservations", async () => {
  const store = inventoryStore(product(1, 6));
  const service = new InventoryService(store);
  await service.reserveCartInventory(cartHold(2, t0, "cart-a", "owner-a"));
  await service.reserveInventory(attempt("checkout-b", 2, "cart-b", "owner-b"));
  await assert.rejects(
    service.adjustInventory(1, { physical: 3, now: t0 }),
    (error: unknown) => inventoryCode(error, "insufficient_stock")
  );
  assert.equal(store.products.get(1)?.physical, 6);
});

test("out-of-stock Add to Cart is rejected server-side", async () => {
  const route = await source("../src/app/api/cart/add/route.ts");
  assert.match(route, /reserveCartInventoryInTransaction/);
  assert.match(route, /error instanceof InventoryError/);
  assert.match(route, /\? 404 : 409/);
});

test("cart quantity above availability is rejected server-side", async () => {
  const route = await source("../src/app/api/cart/add/route.ts");
  assert.match(route, /requestedQuantity/);
  assert.match(route, /reserveCartInventoryInTransaction/);
});

test("invalid inventory thresholds are rejected", () => {
  assert.throws(
    () => validateInventoryThresholds(3, 4),
    (error: unknown) => inventoryCode(error, "invalid_thresholds")
  );
  assert.throws(() => getInventoryStatus(1, -1, 0));
});

test("database-only alerts explicitly report notification not_configured", async () => {
  const store = inventoryStore(product(1, 11));
  await new InventoryService(store).adjustInventory(1, { physical: 10, now: t0 });
  assert.equal(store.alerts[0].notificationStatus, "not_configured");
});

test("expired reservation cleanup is optional for availability correctness", async () => {
  const store = inventoryStore(product(1, 2));
  store.reservations.push(reservation({ expiresAt: later(-1) }));
  const service = new InventoryService(store);
  assert.equal((await service.getAvailability(1, t0)).available, 2);
  assert.equal(await service.cleanupExpiredReservations(t0), 1);
  assert.equal(store.reservations[0].state, "expired");
});

test("releasing a reservation restores availability and verifies ownership", async () => {
  const store = inventoryStore(product(1, 2));
  const service = new InventoryService(store);
  await service.reserveInventory(attempt("attempt-a", 1));
  await assert.rejects(
    service.releaseReservation({ ...consume("attempt-a"), ownerKey: "other" }),
    (error: unknown) => inventoryCode(error, "reservation_owner_mismatch")
  );
  await service.releaseReservation(consume("attempt-a"));
  assert.equal((await service.getAvailability(1, t0)).available, 2);
});

test("disabled merchant availability prevents reservation", async () => {
  const disabled = { ...product(1, 2), isAvailable: false };
  await assert.rejects(
    new InventoryService(inventoryStore(disabled)).reserveInventory(attempt("a", 1)),
    (error: unknown) => inventoryCode(error, "product_unavailable")
  );
});

test("database migrations and store enforce integrity, binding, timing, and locking", async () => {
  const [migration, alertMigration, cartMigration, storeSource] = await Promise.all([
    source("../src/drizzle/migrations/0002_classy_bloodstorm.sql"),
    source("../src/drizzle/migrations/0003_free_vermin.sql"),
    source("../src/drizzle/migrations/0004_soft_cart_reservations.sql"),
    source("../src/lib/inventory/drizzle-store.ts"),
  ]);
  assert.match(migration, /quantity_non_negative[\s\S]*quantity" >= 0/);
  assert.match(migration, /critical_threshold_not_above_low/);
  assert.match(migration, /reservation_quantity_positive/);
  assert.match(alertMigration, /severity_rank" > 1/);
  assert.match(cartMigration, /reservation_purpose_valid/);
  assert.match(cartMigration, /started_at/);
  assert.match(cartMigration, /last_activity_at/);
  assert.match(cartMigration, /max_expires_at/);
  assert.match(
    alertMigration,
    /inventory_alert_unresolved_product_unique[\s\S]*\("product_id"\)/
  );
  assert.match(storeSource, /\.for\("update"\)/);
  assert.match(storeSource, /pg_advisory_xact_lock/);
  assert.doesNotMatch(
    storeSource,
    /set:\s*\{[\s\S]{0,200}ownerKey: reservation\.ownerKey/
  );
});

test("future dashboard helpers summarize and filter inventory health", () => {
  const items = [
    calculateInventoryAvailability(product(1, 20), 0),
    calculateInventoryAvailability(product(2, 10), 0),
    calculateInventoryAvailability(product(3, 4), 0),
    calculateInventoryAvailability(product(4, 0), 0),
  ];
  assert.deepEqual(summarizeInventoryHealth(items), {
    in_stock: 1,
    low_stock: 1,
    critical_stock: 1,
    out_of_stock: 1,
  });
  assert.deepEqual(
    filterInventoryByStatus(items, "critical_stock").map((item) => item.id),
    [3]
  );
});

type StoredAlert = NewInventoryAlert & {
  id: string;
  resolvedAt: Date | null;
};

class MemoryInventoryStore implements InventoryStore, InventoryTransaction {
  products = new Map<number, InventoryProductRecord>();
  reservations: InventoryReservationRecord[] = [];
  alerts: StoredAlert[] = [];
  private transactionTail: Promise<void> = Promise.resolve();

  constructor(products: InventoryProductRecord[]) {
    for (const item of products) this.products.set(item.id, structuredClone(item));
  }

  async transaction<T>(callback: (tx: InventoryTransaction) => Promise<T>) {
    const previous = this.transactionTail;
    let unlock!: () => void;
    this.transactionTail = new Promise<void>((resolve) => (unlock = resolve));
    await previous;
    const snapshot = structuredClone({
      products: [...this.products.entries()],
      reservations: this.reservations,
      alerts: this.alerts,
    });
    try {
      return await callback(this);
    } catch (error) {
      this.products = new Map(snapshot.products);
      this.reservations = snapshot.reservations;
      this.alerts = snapshot.alerts;
      throw error;
    } finally {
      unlock();
    }
  }

  async getProducts(ids: number[]) {
    return ids.flatMap((id) => {
      const item = this.products.get(id);
      return item ? [structuredClone(item)] : [];
    });
  }

  lockProducts(ids: number[]) {
    return this.getProducts(ids);
  }

  async lockReservationAttempt(_checkoutToken: string) {}

  async getActiveReservationTotals(
    ids: number[],
    now: Date,
    exclude?: ReservationAttemptIdentity | ReservationAttemptIdentity[]
  ) {
    const excluded = exclude ? (Array.isArray(exclude) ? exclude : [exclude]) : [];
    const totals = new Map<number, number>();
    for (const item of this.reservations) {
      if (
        ids.includes(item.productId) &&
        item.state === "active" &&
        item.expiresAt.getTime() > now.getTime() &&
        !(
          excluded.some((attempt) =>
            item.checkoutToken === attempt.checkoutToken &&
            item.cartId === attempt.cartId &&
            item.ownerKey === attempt.ownerKey &&
            item.purpose === attempt.purpose
          )
        )
      ) {
        totals.set(item.productId, (totals.get(item.productId) ?? 0) + item.quantity);
      }
    }
    return totals;
  }

  async getAttemptReservations(checkoutToken: string) {
    return structuredClone(
      this.reservations.filter(
        (item) => item.checkoutToken === checkoutToken
      )
    );
  }

  async upsertReservations(input: NewInventoryReservation[]) {
    for (const item of input) {
      const existing = this.reservations.find(
        (candidate) =>
          candidate.checkoutToken === item.checkoutToken &&
          candidate.productId === item.productId
      );
      if (existing) {
        Object.assign(existing, {
          quantity: item.quantity,
          startedAt: structuredClone(item.startedAt),
          lastActivityAt: structuredClone(item.lastActivityAt),
          expiresAt: structuredClone(item.expiresAt),
          maxExpiresAt: structuredClone(item.maxExpiresAt),
          state: "active" as const,
        });
      } else {
        this.reservations.push({
          id: `reservation-${this.reservations.length + 1}`,
          ...structuredClone(item),
          state: "active",
        });
      }
    }
  }

  async releaseAttemptReservationsExcept(
    attempt: ReservationAttemptIdentity,
    retainedProductIds: number[],
    _now: Date
  ) {
    for (const item of this.reservations) {
      if (
        item.checkoutToken === attempt.checkoutToken &&
        item.cartId === attempt.cartId &&
        item.ownerKey === attempt.ownerKey &&
        item.purpose === attempt.purpose &&
        item.state === "active" &&
        !retainedProductIds.includes(item.productId)
      ) item.state = "released";
    }
  }

  async markAttemptReservations(
    attempt: ReservationAttemptIdentity,
    state: Exclude<ReservationState, "active">,
    _now: Date
  ) {
    let count = 0;
    for (const item of this.reservations) {
      if (
        item.checkoutToken === attempt.checkoutToken &&
        item.cartId === attempt.cartId &&
        item.ownerKey === attempt.ownerKey &&
        item.purpose === attempt.purpose &&
        item.state === "active"
      ) {
        item.state = state;
        count += 1;
      }
    }
    return count;
  }

  async updateProductInventory(
    productId: number,
    input: { physical: number; lowStockThreshold: number; criticalStockThreshold: number }
  ) {
    const existing = this.products.get(productId);
    if (!existing) throw new Error("missing product");
    Object.assign(existing, input);
  }

  async getUnresolvedAlerts(productId: number): Promise<InventoryAlertRecord[]> {
    return this.alerts
      .filter((alert) => alert.productId === productId && alert.resolvedAt === null)
      .map(({ id, productId, alertType }) => ({ id, productId, alertType }));
  }

  async resolveAlerts(productId: number, types: InventoryAlertType[], resolvedAt: Date) {
    for (const alert of this.alerts) {
      if (alert.productId === productId && types.includes(alert.alertType) && alert.resolvedAt === null) {
        alert.resolvedAt = resolvedAt;
      }
    }
  }

  async createAlert(alert: NewInventoryAlert) {
    if (
      this.alerts.some(
        (item) => item.productId === alert.productId && item.resolvedAt === null
      )
    ) {
      throw new Error("duplicate unresolved alert");
    }
    this.alerts.push({ ...structuredClone(alert), id: `alert-${this.alerts.length + 1}`, resolvedAt: null });
  }

  async cleanupExpiredReservations(now: Date) {
    let count = 0;
    for (const item of this.reservations) {
      if (item.state === "active" && item.expiresAt.getTime() <= now.getTime()) {
        item.state = "expired";
        count += 1;
      }
    }
    return count;
  }
}

function inventoryStore(...products: InventoryProductRecord[]) {
  return new MemoryInventoryStore(products);
}

function product(id: number, physical: number): InventoryProductRecord {
  return {
    id,
    physical,
    lowStockThreshold: 10,
    criticalStockThreshold: 4,
    isActive: true,
    isAvailable: true,
  };
}

function attempt(
  checkoutToken: string,
  quantity: number,
  cartId = "cart-a",
  ownerKey = "owner-a"
) {
  return {
    checkoutToken,
    quantity,
    cartId,
    ownerKey,
    now: t0,
    durationMs: 60_000,
    items: [{ productId: 1, quantity }],
  };
}

function cartHold(
  quantity: number,
  now = t0,
  cartId = "cart-a",
  ownerKey = "owner-a"
) {
  return {
    quantity,
    cartId,
    ownerKey,
    now,
    idleDurationMs: 60 * 60_000,
    maxDurationMs: 120 * 60_000,
    items: [{ productId: 1, quantity }],
  };
}

function consume(checkoutToken: string) {
  return { checkoutToken, cartId: "cart-a", ownerKey: "owner-a", now: t0 };
}

function reservation(overrides: Partial<InventoryReservationRecord> = {}): InventoryReservationRecord {
  return {
    id: "reservation-existing",
    ownerKey: "owner-a",
    cartId: "cart-a",
    checkoutToken: "existing-attempt",
    purpose: "checkout",
    productId: 1,
    quantity: 3,
    state: "active",
    expiresAt: later(1),
    startedAt: t0,
    lastActivityAt: t0,
    maxExpiresAt: later(1),
    ...overrides,
  };
}

function activeAlerts(store: MemoryInventoryStore, type: InventoryAlertType) {
  return store.alerts.filter((alert) => alert.alertType === type && alert.resolvedAt === null);
}

function unresolvedAlertTypes(store: MemoryInventoryStore) {
  return store.alerts
    .filter((alert) => alert.resolvedAt === null)
    .map((alert) => alert.alertType);
}

function later(minutes: number) {
  return new Date(t0.getTime() + minutes * 60_000);
}

function inventoryCode(error: unknown, code: string) {
  return error instanceof InventoryError && error.code === code;
}

async function source(relativePath: string) {
  return readFile(new URL(relativePath, import.meta.url), "utf8");
}
