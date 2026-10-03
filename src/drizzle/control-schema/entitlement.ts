import {
  check,
  integer,
  pgTable,
  primaryKey,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { plans } from "./plan";

export const entitlements = pgTable(
  "entitlements",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    description: varchar("description", { length: 1000 }),
    valueType: varchar("value_type", { length: 16 })
      .$type<"boolean" | "integer">()
      .notNull()
      .default("integer"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("entitlements_code_unique").on(table.code),
    check(
      "entitlements_value_type_check",
      sql`${table.valueType} IN ('boolean', 'integer')`
    ),
  ]
);

export const planEntitlements = pgTable(
  "plan_entitlements",
  {
    planId: integer("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    entitlementId: integer("entitlement_id")
      .notNull()
      .references(() => entitlements.id, { onDelete: "cascade" }),
    value: integer("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({ columns: [table.planId, table.entitlementId] }),
    check(
      "plan_entitlements_value_check",
      sql`${table.value} >= -1`
    ),
  ]
);
