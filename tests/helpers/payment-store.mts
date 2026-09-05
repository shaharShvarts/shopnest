import type {
  PaymentStore,
  PaymentTransaction,
} from "../../src/lib/payments/store.ts";
import type {
  PaymentAttempt,
  PaymentOrder,
  PaymentSettings,
} from "../../src/lib/payments/types.ts";
import {
  consumeReservationInTransaction,
  releaseReservationInTransaction,
  validateCheckoutReservationInTransaction,
  type InventoryTransaction,
  type InventoryReservationRecord,
} from "../../src/lib/inventory/core.ts";
import { DatabaseOnlyInventoryNotificationService } from "../../src/lib/inventory/notifications.ts";

// Test-only adapter/store; never imported by runtime registry or application code.
export class MemoryPaymentStore implements PaymentStore {
  readonly tenant: string;
  settings: PaymentSettings | null = {
    provider: "cardcom",
    environment: "test",
    enabled: true,
    encryptedCredentials: "test-only-encrypted",
    configuredFields: ["terminalNumber", "apiName"],
  };
  order: PaymentOrder = {
    id: 1,
    amount: 250,
    currency: "ILS",
    ownerKey: "session:buyer",
    cartId: "cart-1",
    checkoutToken: "checkout-1",
    paymentStatus: "pending",
    payable: true,
    items: [{ productId: 1, quantity: 2 }],
  };
  attempts: PaymentAttempt[] = [];
  physical = 10;
  consumed = 0;
  failMarkPaid = false;
  reservations: InventoryReservationRecord[] = [
    {
      id: "r1",
      ownerKey: "session:buyer",
      cartId: "cart-1",
      checkoutToken: "checkout-1",
      purpose: "checkout",
      productId: 1,
      quantity: 2,
      state: "active",
      startedAt: new Date(),
      lastActivityAt: new Date(),
      expiresAt: new Date(Date.now() + 900000),
      maxExpiresAt: new Date(Date.now() + 900000),
    },
  ];
  private queue: Promise<void> = Promise.resolve();
  constructor(tenant = "gift-shop") {
    this.tenant = tenant;
  }
  async getAttempt(id: string) {
    return structuredClone(this.attempts.find((row) => row.id === id) ?? null);
  }

  async transaction<T>(
    callback: (tx: PaymentTransaction) => Promise<T>,
  ): Promise<T> {
    const previous = this.queue;
    let unlock!: () => void;
    this.queue = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    await previous;
    const before = structuredClone({
      order: this.order,
      attempts: this.attempts,
      physical: this.physical,
      consumed: this.consumed,
      reservations: this.reservations,
    });
    const inventory: InventoryTransaction = {
      lockReservationAttempt: async () => {},
      getAttemptReservations: async (token) =>
        this.reservations.filter((row) => row.checkoutToken === token),
      getProducts: async () => [
        {
          id: 1,
          physical: this.physical,
          lowStockThreshold: 3,
          criticalStockThreshold: 1,
          isActive: true,
          isAvailable: true,
        },
      ],
      lockProducts: async () => inventory.getProducts([1]),
      getActiveReservationTotals: async () => new Map(),
      updateProductInventory: async (_id, value) => {
        this.physical = value.physical;
        this.consumed++;
      },
      markAttemptReservations: async (attempt, state) => {
        const rows = this.reservations.filter(
          (row) =>
            row.state === "active" &&
            row.checkoutToken === attempt.checkoutToken &&
            row.ownerKey === attempt.ownerKey &&
            row.cartId === attempt.cartId &&
            row.purpose === attempt.purpose,
        );
        for (const row of rows) row.state = state;
        return rows.length;
      },
      getUnresolvedAlerts: async () => [],
      resolveAlerts: async () => {},
      createAlert: async () => {},
      cleanupExpiredReservations: async () => 0,
      upsertReservations: async () => {
        throw new Error("unused");
      },
      releaseAttemptReservationsExcept: async () => {
        throw new Error("unused");
      },
    };
    const input = (order: PaymentOrder) => ({
      ...order,
      expectedItems: order.items,
    });
    try {
      return await callback({
        lockOrder: async (id) =>
          id === this.order.id ? structuredClone(this.order) : null,
        getSettings: async () => structuredClone(this.settings),
        findAttemptForOrder: async (id) =>
          structuredClone(
            this.attempts.find((row) => row.orderId === id) ?? null,
          ),
        getAttempt: async (id) => this.getAttempt(id),
        insertAttempt: async (attempt) => {
          if (this.attempts.some((row) => row.orderId === attempt.orderId))
            throw new Error("unique");
          this.attempts.push(structuredClone(attempt));
        },
        updateAttempt: async (attempt) => {
          this.attempts[
            this.attempts.findIndex((row) => row.id === attempt.id)
          ] = structuredClone(attempt);
        },
        reservationValid: (order) =>
          validateCheckoutReservationInTransaction(inventory, input(order)),
        consumeInventory: async (order) => {
          await consumeReservationInTransaction(
            inventory,
            input(order),
            new DatabaseOnlyInventoryNotificationService(),
          );
        },
        releaseInventory: async (order) => {
          await releaseReservationInTransaction(inventory, input(order));
        },
        markOrderPaid: async () => {
          if (this.failMarkPaid) throw new Error("injected commit failure");
          this.order.paymentStatus = "paid";
        },
      });
    } catch (error) {
      Object.assign(this, before);
      throw error;
    } finally {
      unlock();
    }
  }
}
