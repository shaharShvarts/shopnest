import "server-only";
import { eq, sql, desc } from "drizzle-orm";
import { getDbForTenant } from "@/drizzle/db";
import {
  orders,
  orderProducts,
  paymentProviderSettings,
  paymentTransactions,
} from "@/drizzle/schema";
import { resolveConfiguredTenant, type Tenant } from "@/lib/tenant";
import { DrizzleInventoryTransaction } from "@/lib/inventory/drizzle-store";
import {
  consumeReservationInTransaction,
  releaseReservationInTransaction,
  validateCheckoutReservationInTransaction,
} from "@/lib/inventory/core";
import { DatabaseOnlyInventoryNotificationService } from "@/lib/inventory/notifications";
import { prepareSettings, settingsReadModel } from "./settings";
import { PaymentError, type PaymentOrder } from "./types";
import type { PaymentStore, PaymentTransaction } from "./store";

function reservationInput(order: PaymentOrder) {
  return {
    ownerKey: order.ownerKey,
    cartId: order.cartId,
    checkoutToken: order.checkoutToken,
    expectedItems: order.items,
  };
}

export class DrizzlePaymentStore implements PaymentStore {
  readonly tenant: string;
  private readonly database: ReturnType<typeof getDbForTenant>;

  constructor(tenant: Tenant) {
    const configured = tenant && resolveConfiguredTenant(tenant.slug);
    if (
      !configured ||
      configured.schema !== tenant.schema ||
      configured.basePath !== tenant.basePath
    )
      throw new PaymentError("unknown_tenant");
    this.tenant = configured.slug;
    this.database = getDbForTenant(configured); // Never pass null; never public fallback.
  }

  async getAttempt(id: string) {
    const [attempt] = await this.database
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.id, id))
      .limit(1);
    return attempt ?? null;
  }

  async readSettings() {
    const [settings] = await this.database
      .select()
      .from(paymentProviderSettings)
      .where(eq(paymentProviderSettings.id, 1));
    return settingsReadModel(settings ?? null);
  }

  async saveSettings(input: unknown) {
    await this.database.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(current_schema() || ':payment_settings', 0))`,
      );
      const [previous] = await tx
        .select()
        .from(paymentProviderSettings)
        .where(eq(paymentProviderSettings.id, 1))
        .for("update");
      const settings = prepareSettings(input, previous ?? null, this.tenant);
      await tx
        .insert(paymentProviderSettings)
        .values({ id: 1, ...settings })
        .onConflictDoUpdate({
          target: paymentProviderSettings.id,
          set: { ...settings, updatedAt: new Date() },
        });
    });
  }

  async recentPayments() {
    // Deliberate projection. Neither encrypted credentials nor redirect tokens reach admin.
    return this.database
      .select({
        id: paymentTransactions.id,
        orderId: paymentTransactions.orderId,
        provider: paymentTransactions.provider,
        status: paymentTransactions.status,
        amount: paymentTransactions.amount,
        currency: paymentTransactions.currency,
      })
      .from(paymentTransactions)
      .orderBy(desc(paymentTransactions.createdAt))
      .limit(25);
  }

  transaction<T>(callback: (tx: PaymentTransaction) => Promise<T>): Promise<T> {
    return this.database.transaction(async (tx) => {
      const inventory = new DrizzleInventoryTransaction(tx);
      const transaction: PaymentTransaction = {
        async lockOrder(id) {
          const [order] = await tx
            .select()
            .from(orders)
            .where(eq(orders.id, id))
            .for("update");
          if (!order || !order.cartId || !order.checkoutToken) return null;
          const items = await tx
            .select({
              productId: orderProducts.productId,
              quantity: orderProducts.quantity,
            })
            .from(orderProducts)
            .where(eq(orderProducts.orderId, id));
          const ownerKey = order.customerAccountId
            ? `customer:${order.customerAccountId}`
            : order.userId
              ? `user:${order.userId}`
              : `session:${order.sessionId}`;
          return {
            id,
            amount: order.totalPrice,
            currency: order.currency,
            paymentStatus: order.paymentStatus,
            payable: order.status === "pending" && !order.deletedAt,
            ownerKey,
            cartId: order.cartId,
            checkoutToken: order.checkoutToken,
            items,
          };
        },
        async getSettings() {
          const [settings] = await tx
            .select()
            .from(paymentProviderSettings)
            .where(eq(paymentProviderSettings.id, 1));
          return settings ?? null;
        },
        async findAttemptForOrder(id) {
          const [attempt] = await tx
            .select()
            .from(paymentTransactions)
            .where(eq(paymentTransactions.orderId, id));
          return attempt ?? null;
        },
        async getAttempt(id) {
          const [attempt] = await tx
            .select()
            .from(paymentTransactions)
            .where(eq(paymentTransactions.id, id))
            .for("update");
          return attempt ?? null;
        },
        async insertAttempt(attempt) {
          await tx.insert(paymentTransactions).values(attempt);
        },
        async updateAttempt(attempt) {
          await tx
            .update(paymentTransactions)
            .set({
              status: attempt.status,
              providerTransactionId: attempt.providerTransactionId,
              redirectUrl: attempt.redirectUrl,
              failureCode: attempt.failureCode,
              confirmedAt: attempt.confirmedAt,
              updatedAt: new Date(),
            })
            .where(eq(paymentTransactions.id, attempt.id));
        },
        reservationValid: (order) =>
          validateCheckoutReservationInTransaction(
            inventory,
            reservationInput(order),
          ),
        async consumeInventory(order) {
          await consumeReservationInTransaction(
            inventory,
            reservationInput(order),
            new DatabaseOnlyInventoryNotificationService(),
          );
        },
        async releaseInventory(order) {
          await releaseReservationInTransaction(
            inventory,
            reservationInput(order),
          );
        },
        async markOrderPaid(id, provider) {
          await tx
            .update(orders)
            .set({
              paymentStatus: "paid",
              paidAt: new Date(),
              paymentMethod: provider,
              status: "processing",
            })
            .where(eq(orders.id, id));
        },
      };
      return callback(transaction);
    });
  }
}
