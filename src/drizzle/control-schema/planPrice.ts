import { sql } from "drizzle-orm";
import {
  check,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { plans } from "./plan";

export const planPrices = pgTable(
  "plan_prices",
  {
    planId: integer("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    billingInterval: varchar("billing_interval", { length: 16 })
      .$type<"monthly" | "annual">()
      .notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("ILS"),
    amountMinor: integer("amount_minor").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    primaryKey({
      columns: [table.planId, table.billingInterval, table.currency],
    }),
    check(
      "plan_prices_billing_interval_check",
      sql`${table.billingInterval} IN ('monthly', 'annual')`
    ),
    check(
      "plan_prices_currency_check",
      sql`${table.currency} ~ '^[A-Z]{3}$'`
    ),
    check(
      "plan_prices_amount_nonnegative_check",
      sql`${table.amountMinor} >= 0`
    ),
  ]
);
