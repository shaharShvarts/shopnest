import {
  pgTable,
  timestamp,
  integer,
  index,
  varchar,
  uuid,
  check,
  uniqueIndex,
  pgEnum,
} from "drizzle-orm/pg-core";
import { products } from "./product";
import { carts } from "./cart";
import { relations, sql } from "drizzle-orm";
import { createdAt, id, updatedAt } from "../schemaHelpers";

export const reservationStates = [
  "active",
  "consumed",
  "released",
  "expired",
] as const;
export type ReservationState = (typeof reservationStates)[number];
export const reservationPurposes = ["cart", "checkout"] as const;
export type ReservationPurpose = (typeof reservationPurposes)[number];
export const reservationStateEnum = pgEnum(
  "reservation_state",
  reservationStates
);

export const reservations = pgTable(
  "reservations",
  {
    id: id(),
    ownerKey: varchar("user_id").notNull(),
    purpose: varchar("type")
      .$type<ReservationPurpose>()
      .notNull()
      .default("checkout"),
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    quantity: integer("quantity").notNull(),
    cartId: uuid("cart_id").references(() => carts.id, {
      onDelete: "cascade",
    }),
    checkoutToken: uuid("checkout_token").notNull(),
    state: reservationStateEnum().notNull().default("active"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    maxExpiresAt: timestamp("max_expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("reservation_quantity_positive", sql`${table.quantity} > 0`),
    check(
      "reservation_purpose_valid",
      sql`${table.purpose} in ('cart', 'checkout')`
    ),
    check(
      "reservation_expiry_order_valid",
      sql`${table.startedAt} <= ${table.lastActivityAt} and ${table.lastActivityAt} <= ${table.expiresAt} and ${table.expiresAt} <= ${table.maxExpiresAt}`
    ),
    uniqueIndex("reservation_attempt_product_unique").on(
      table.checkoutToken,
      table.productId
    ),
    index("reservation_active_product_expiry_idx").on(
      table.productId,
      table.state,
      table.expiresAt
    ),
    index("reservation_cart_attempt_idx").on(
      table.cartId,
      table.checkoutToken
    ),
  ]
);

export type Reservation = typeof reservations.$inferSelect;

export const reservationRelations = relations(reservations, ({ one }) => ({
  product: one(products, {
    fields: [reservations.productId],
    references: [products.id],
  }),
  cart: one(carts, {
    fields: [reservations.cartId],
    references: [carts.id],
  }),
}));
