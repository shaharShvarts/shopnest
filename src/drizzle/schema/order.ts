import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  varchar,
  timestamp,
  pgEnum,
  uuid,
  check,
  index,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createdAt, deletedAt, updatedAt } from "../schemaHelpers";
import { users } from "./user";
import { orderProducts } from "./orderProduct";
import { carts } from "./cart";
import { shippingMethods, shippingMethodTypeEnum } from "./shippingMethod";

export const orderStatus = [
  "pending",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
  "failed",
] as const;
export type OrderStatus = (typeof orderStatus)[number];
export const orderStatusEnum = pgEnum("order_status", orderStatus);

export const fulfillmentStatuses = [
  "unfulfilled",
  "processing",
  "shipped",
  "delivered",
  "ready_for_pickup",
  "picked_up",
  "cancelled",
] as const;
export type FulfillmentStatus = (typeof fulfillmentStatuses)[number];
export const fulfillmentStatusEnum = pgEnum(
  "fulfillment_status",
  fulfillmentStatuses
);

// ORDERS
export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => users.id),
    customerAccountId: integer("customer_account_id"),
    sessionId: varchar("session_id"),
    cartId: uuid("cart_id").references(() => carts.id).unique(),
    checkoutToken: uuid("checkout_token").unique(),
    orderNumber: varchar("order_number").notNull().unique(),
    email: varchar("email"),
    firstName: varchar("first_name").notNull(),
    lastName: varchar("last_name").notNull(),
    phoneNumber: text("phone_number").notNull(),
    shippingMethod: text("shipping_method").notNull(),
    shippingMethodId: integer("shipping_method_id").references(
      () => shippingMethods.id,
      { onDelete: "set null" }
    ),
    shippingMethodCode: varchar("shipping_method_code", { length: 64 }),
    shippingMethodName: varchar("shipping_method_name", { length: 120 }),
    shippingMethodType: shippingMethodTypeEnum("shipping_method_type"),
    shippingPrice: integer("shipping_price"),
    shippingFreeThresholdApplied: boolean(
      "shipping_free_threshold_applied"
    ).notNull().default(false),
    itemsSubtotal: integer("items_subtotal"),
    shippingTotal: integer("shipping_total"),
    numberOfItems: integer("numberOfItems").notNull(),
    currency: varchar("currency").notNull(),
    status: orderStatusEnum().notNull().default("pending"),
    emailSent: boolean("email_sent").default(false),
    totalPrice: integer("total_price").notNull(),
    shippingAddress: text("shipping_address"),
    billingAddress: text("billing_address"),
    paymentMethod: text("payment_method").notNull(),
    fulfillmentStatus: fulfillmentStatusEnum("fulfillment_status")
      .notNull()
      .default("unfulfilled"),
    trackingNumber: text("tracking_number"),
    shippingDate: timestamp("shipping_date"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    readyForPickupAt: timestamp("ready_for_pickup_at", {
      withTimezone: true,
    }),
    pickedUpAt: timestamp("picked_up_at", { withTimezone: true }),
    deletedAt,
    updatedAt,
    createdAt,
  },
  (table) => [
    check(
      "orders_customer_or_session",
      sql`${table.userId} IS NOT NULL OR ${table.sessionId} IS NOT NULL OR ${table.customerAccountId} IS NOT NULL`
    ),
    index("orders_customer_account_created_idx").on(
      table.customerAccountId,
      table.createdAt
    ),
    index("orders_fulfillment_created_idx").on(
      table.fulfillmentStatus,
      table.createdAt
    ),
    check(
      "orders_shipping_amounts_non_negative",
      sql`(${table.itemsSubtotal} IS NULL OR ${table.itemsSubtotal} >= 0) AND (${table.shippingTotal} IS NULL OR ${table.shippingTotal} >= 0) AND (${table.shippingPrice} IS NULL OR ${table.shippingPrice} >= 0)`
    ),
  ]
);

// Order Relations
export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  cart: one(carts, { fields: [orders.cartId], references: [carts.id] }),
  shippingMethodRecord: one(shippingMethods, {
    fields: [orders.shippingMethodId],
    references: [shippingMethods.id],
  }),
  orderProducts: many(orderProducts),
}));
