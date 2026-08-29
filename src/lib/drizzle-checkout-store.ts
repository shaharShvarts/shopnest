import { and, eq, sql } from "drizzle-orm";
import { getDbForTenant } from "@/drizzle/db";
import {
  cartProducts,
  carts,
  orderProducts,
  orders,
  products,
} from "@/drizzle/schema";
import type {
  CheckoutIdentity,
  CheckoutStore,
  CheckoutTransaction,
  NewCheckoutOrder,
} from "./checkout/create-order";
import { reserveInventoryInTransaction } from "./inventory/core";
import { getInventoryReservationDurationMs } from "./inventory/config";
import { DrizzleInventoryTransaction } from "./inventory/drizzle-store";

type TenantDatabase = ReturnType<typeof getDbForTenant>;

function identityCondition(identity: CheckoutIdentity) {
  return identity.userId
    ? eq(orders.userId, identity.userId)
    : eq(orders.sessionId, identity.sessionId!);
}

export class DrizzleCheckoutStore implements CheckoutStore {
  constructor(
    private readonly database: TenantDatabase,
    private readonly reservationDurationMs = getInventoryReservationDurationMs()
  ) {}

  transaction<T>(
    callback: (transaction: CheckoutTransaction) => Promise<T>
  ): Promise<T> {
    const reservationDurationMs = this.reservationDurationMs;
    return this.database.transaction(async (tx) => {
      const transaction: CheckoutTransaction = {
        async lockSubmission(checkoutToken) {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${checkoutToken}, 0))`
          );
        },

        async findOrderByCheckoutToken(checkoutToken, identity) {
          const [order] = await tx
            .select({
              orderId: orders.id,
              orderNumber: orders.orderNumber,
              totalPrice: orders.totalPrice,
            })
            .from(orders)
            .where(
              and(
                eq(orders.checkoutToken, checkoutToken),
                identityCondition(identity)
              )
            )
            .limit(1);

          return order ?? null;
        },

        async lockActiveCart(identity) {
          const cartIdentity = identity.userId
            ? eq(carts.userId, identity.userId)
            : eq(carts.sessionId, identity.sessionId!);
          const [cart] = await tx
            .select({ id: carts.id, currency: carts.currency })
            .from(carts)
            .where(and(cartIdentity, eq(carts.isActive, true)))
            .limit(1)
            .for("update");

          return cart ?? null;
        },

        async getCartItems(cartId) {
          return tx
            .select({
              productId: cartProducts.productId,
              quantity: cartProducts.quantity,
              price: products.price,
            })
            .from(cartProducts)
            .leftJoin(products, eq(cartProducts.productId, products.id))
            .where(eq(cartProducts.cartId, cartId));
        },

        async reserveInventory(input) {
          await reserveInventoryInTransaction(
            new DrizzleInventoryTransaction(tx),
            {
              ...input,
              durationMs: reservationDurationMs,
            }
          );
        },

        async createOrder(order: NewCheckoutOrder) {
          const [createdOrder] = await tx
            .insert(orders)
            .values({
              userId: order.userId,
              sessionId: order.sessionId,
              cartId: order.cartId,
              checkoutToken: order.checkoutToken,
              orderNumber: order.orderNumber,
              email: order.email,
              firstName: order.firstName,
              lastName: order.lastName,
              phoneNumber: order.phoneNumber,
              shippingMethod: order.shippingMethod,
              numberOfItems: order.numberOfItems,
              currency: order.currency,
              status: "pending",
              totalPrice: order.totalPrice,
              shippingAddress: order.shippingAddress,
              billingAddress: order.billingAddress,
              paymentMethod: "pending_payment",
            })
            .returning({ id: orders.id, orderNumber: orders.orderNumber });

          return createdOrder;
        },

        async createOrderProducts(items) {
          await tx.insert(orderProducts).values(items);
        },

        async deactivateCart(cartId) {
          const deactivated = await tx
            .update(carts)
            .set({ isActive: false })
            .where(and(eq(carts.id, cartId), eq(carts.isActive, true)))
            .returning({ id: carts.id });

          return deactivated.length === 1;
        },
      };

      return callback(transaction);
    });
  }
}
