import {
  pgTable,
  integer,
  text,
  boolean,
  varchar,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "../schemaHelpers";
import { users } from "./user";
import { cartProducts } from "./cartProduct";
import { relations, sql } from "drizzle-orm";

export const carts = pgTable(
  "carts",
  {
    id: id(),
    isActive: boolean("is_active").notNull().default(true),
    sessionId: varchar("session_id"),
    totalPrice: integer("total_price").default(0).notNull(),
    currency: text("currency").notNull().default("ILS"),
    isAbandoned: boolean("is_abandoned").default(false),
    userId: integer("user_id").references(() => users.id),
    customerAccountId: integer("customer_account_id"),
    createdAt,
    updatedAt,
  },
  (table) => [
    check(
      "carts_customer_or_session",
      sql`${table.userId} IS NOT NULL OR ${table.sessionId} IS NOT NULL OR ${table.customerAccountId} IS NOT NULL`
    ),
    uniqueIndex("carts_active_customer_account_unique")
      .on(table.customerAccountId)
      .where(
        sql`${table.isActive} = true AND ${table.customerAccountId} IS NOT NULL`
      ),
  ]
);

// Cart Relations
export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, { fields: [carts.userId], references: [users.id] }),
  cartProducts: many(cartProducts),
}));
