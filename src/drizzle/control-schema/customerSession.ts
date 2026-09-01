import { index, integer, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { customerAccounts } from "./customerAccount";

export const customerSessions = pgTable(
  "customer_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customerAccounts.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("customer_sessions_expires_at_idx").on(table.expiresAt)]
);
