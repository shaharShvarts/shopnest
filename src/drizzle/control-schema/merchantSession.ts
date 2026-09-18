import { index, integer, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { merchantAccounts } from "./merchantAccount";

export const merchantSessions = pgTable(
  "merchant_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    merchantId: integer("merchant_id")
      .notNull()
      .references(() => merchantAccounts.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("merchant_sessions_expires_at_idx").on(table.expiresAt)]
);
