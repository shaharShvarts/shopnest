import {
  index,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { controlPlaneTenants } from "./tenant";

export const customerOAuthTransactions = pgTable(
  "customer_oauth_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    stateHash: varchar("state_hash", { length: 64 }).notNull(),
    browserBindingHash: varchar("browser_binding_hash", { length: 64 }).notNull(),
    tenantSlug: varchar("tenant_slug", { length: 63 })
      .notNull()
      .references(() => controlPlaneTenants.slug, { onDelete: "cascade" }),
    callbackPath: varchar("callback_path", { length: 2048 }).notNull(),
    nonceHash: varchar("nonce_hash", { length: 64 }).notNull(),
    codeVerifier: varchar("code_verifier", { length: 128 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("customer_oauth_transactions_state_hash_unique").on(
      table.stateHash
    ),
    index("customer_oauth_transactions_expires_at_idx").on(table.expiresAt),
  ]
);
