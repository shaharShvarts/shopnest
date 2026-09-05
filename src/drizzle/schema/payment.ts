import { sql } from "drizzle-orm";
import {
  pgTable,
  integer,
  text,
  boolean,
  uuid,
  timestamp,
  check,
  uniqueIndex,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { createdAt, updatedAt } from "../schemaHelpers";
import { orders } from "./order";
import type {
  PaymentEnvironment,
  PaymentStatus,
  ProviderId,
} from "@/lib/payments/types";

// One row per tenant, not one row per provider. A CHECK + PK enforces singleton.
export const paymentProviderSettings = pgTable(
  "payment_provider_settings",
  {
    id: integer("id").primaryKey().default(1),
    provider: text("provider").$type<ProviderId>().notNull(),
    environment: text("environment").$type<PaymentEnvironment>().notNull(),
    enabled: boolean("enabled").notNull().default(false),
    encryptedCredentials: text("encrypted_credentials").notNull(),
    configuredFields: jsonb("configured_fields")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("payment_settings_singleton", sql`${table.id} = 1`),
    check(
      "payment_settings_provider",
      sql`${table.provider} in ('cardcom', 'pelecard', 'tranzila')`,
    ),
    check(
      "payment_settings_environment",
      sql`${table.environment} in ('test', 'production')`,
    ),
  ],
);

export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: integer("order_id")
      .notNull()
      .references(() => orders.id),
    provider: text("provider").$type<ProviderId>().notNull(),
    environment: text("environment").$type<PaymentEnvironment>().notNull(),
    // Immutable encrypted credential snapshot: rotation cannot redirect an in-flight payment.
    encryptedCredentials: text("encrypted_credentials").notNull(),
    providerTransactionId: text("provider_transaction_id"),
    externalReference: text("external_reference").notNull(),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status").$type<PaymentStatus>().notNull().default("created"),
    redirectUrl: text("redirect_url"),
    failureCode: text("failure_code"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    uniqueIndex("payment_order_unique").on(table.orderId),
    uniqueIndex("payment_external_reference_unique").on(
      table.externalReference,
    ),
    uniqueIndex("payment_provider_transaction_unique").on(
      table.provider,
      table.environment,
      table.providerTransactionId,
    ),
    index("payment_status_created_idx").on(table.status, table.createdAt),
    check("payment_amount_positive", sql`${table.amount} > 0`),
    check("payment_currency_valid", sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check(
      "payment_status_valid",
      sql`${table.status} in ('created','pending','paid','failed','cancelled','expired','review_required')`,
    ),
    check(
      "payment_transaction_provider",
      sql`${table.provider} in ('cardcom', 'pelecard', 'tranzila')`,
    ),
    check(
      "payment_transaction_environment",
      sql`${table.environment} in ('test', 'production')`,
    ),
    check(
      "payment_confirmation_required",
      sql`${table.status} not in ('paid','review_required') or (${table.confirmedAt} is not null and ${table.providerTransactionId} is not null)`,
    ),
  ],
);
