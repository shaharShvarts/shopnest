import {
  boolean,
  check,
  integer,
  pgEnum,
  pgTable,
  serial,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createdAt, updatedAt } from "../schemaHelpers";

export const shippingMethodTypes = [
  "home_delivery",
  "pickup_point",
  "store_pickup",
] as const;
export type ShippingMethodType = (typeof shippingMethodTypes)[number];
export const shippingMethodTypeEnum = pgEnum(
  "shipping_method_type",
  shippingMethodTypes
);

export const shippingMethods = pgTable(
  "shipping_methods",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 120 }).notNull(),
    code: varchar("code", { length: 64 }).notNull(),
    type: shippingMethodTypeEnum("type").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    price: integer("price").notNull().default(0),
    freeShippingThreshold: integer("free_shipping_threshold"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("shipping_methods_code_unique").on(table.code),
    check("shipping_methods_price_non_negative", sql`${table.price} >= 0`),
    check(
      "shipping_methods_threshold_non_negative",
      sql`${table.freeShippingThreshold} IS NULL OR ${table.freeShippingThreshold} >= 0`
    ),
    check(
      "shipping_methods_sort_order_safe",
      sql`${table.sortOrder} >= -1000000 AND ${table.sortOrder} <= 1000000`
    ),
  ]
);
