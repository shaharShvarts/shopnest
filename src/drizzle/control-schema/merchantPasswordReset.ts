import { index, integer, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { merchantAccounts } from "./merchantAccount";

export const merchantPasswordResetTokens = pgTable(
  "merchant_password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchantAccounts.id, { onDelete: "cascade" }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("merchant_password_reset_merchant_idx").on(table.merchantId),
    index("merchant_password_reset_expires_at_idx").on(table.expiresAt),
  ]
);
