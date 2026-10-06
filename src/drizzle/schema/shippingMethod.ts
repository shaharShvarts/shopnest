import {
  boolean,
  check,
  integer,
  pgTable,
  serial,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, deletedAt, updatedAt } from "../schemaHelpers";

export const shippingMethods = pgTable(
  "shipping_methods",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    price: integer("price").notNull().default(0),
    requiresAddress: boolean("requires_address").notNull().default(true),
    isActive: boolean("is_active").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    logoUrl: varchar("logo_url", { length: 512 }),
    deletedAt,
    createdAt,
    updatedAt,
  },
  (table) => [
    check("shipping_methods_price_non_negative", sql`${table.price} >= 0`),
    check(
      "shipping_methods_sort_order_safe",
      sql`${table.sortOrder} >= -1000000 AND ${table.sortOrder} <= 1000000`
    ),
  ]
);
