import {
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { customerAccounts } from "./customerAccount";

export const customerPasswordResetTokens = pgTable(
  "customer_password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customerAccounts.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("customer_password_reset_customer_idx").on(table.customerId),
    index("customer_password_reset_expires_at_idx").on(table.expiresAt),
  ]
);
