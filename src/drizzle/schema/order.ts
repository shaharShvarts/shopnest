import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  varchar,
  timestamp,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createdAt, deletedAt, updatedAt } from "../schemaHelpers";
import { users } from "./user";
import { orderProducts } from "./orderProduct";

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
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  orderNumber: varchar("order_number").notNull().unique(),
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
});

// Order Relations
export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  orderProducts: many(orderProducts),
}));
