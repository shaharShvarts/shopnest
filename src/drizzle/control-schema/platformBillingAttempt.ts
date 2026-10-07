import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./organization";
import { plans } from "./plan";
import { stores } from "./store";
import { subscriptions } from "./subscription";

export const platformBillingStatusEnum = pgEnum("platform_billing_status", [
  "created",
  "pending",
  "paid",
  "failed",
  "cancelled",
  "review_required",
]);

export const platformBillingAttempts = pgTable(
  "platform_billing_attempts",
  {
    id: serial("id").primaryKey(),
    subscriptionId: integer("subscription_id")
      .notNull()
      .references(() => subscriptions.id),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id),
    planId: integer("plan_id")
      .notNull()
      .references(() => plans.id),
    planCodeSnapshot: varchar("plan_code_snapshot", { length: 64 }).notNull(),
    planNameSnapshot: varchar("plan_name_snapshot", { length: 160 }).notNull(),
    billingInterval: varchar("billing_interval", { length: 16 })
      .$type<"monthly" | "annual">()
      .notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    status: platformBillingStatusEnum("status").notNull().default("created"),
    provider: varchar("provider", { length: 64 }),
    providerReference: varchar("provider_reference", { length: 255 }),
    externalReference: varchar("external_reference", { length: 128 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("platform_billing_attempts_external_reference_unique").on(
      table.externalReference
    ),
    index("platform_billing_attempts_subscription_id_idx").on(
      table.subscriptionId
    ),
    index("platform_billing_attempts_store_id_idx").on(table.storeId),
    check(
      "platform_billing_attempts_billing_interval_check",
      sql`${table.billingInterval} IN ('monthly', 'annual')`
    ),
    check(
      "platform_billing_attempts_currency_check",
      sql`${table.currency} ~ '^[A-Z]{3}$'`
    ),
    check(
      "platform_billing_attempts_amount_nonnegative_check",
      sql`${table.amountMinor} >= 0`
    ),
  ]
);
