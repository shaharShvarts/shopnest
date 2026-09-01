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
    numberOfItems: integer("numberOfItems").notNull(),
    currency: varchar("currency").notNull(),
    status: orderStatusEnum().notNull().default("pending"),
    emailSent: boolean("email_sent").default(false),
    totalPrice: integer("total_price").notNull(),
    shippingAddress: text("shipping_address").notNull(),
    billingAddress: text("billing_address").notNull(),
    paymentMethod: text("payment_method").notNull(),
    trackingNumber: text("tracking_number"),
    shippingDate: timestamp("shipping_date"),
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
  ]
);

// Order Relations
export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  cart: one(carts, { fields: [orders.cartId], references: [carts.id] }),
  orderProducts: many(orderProducts),
}));
