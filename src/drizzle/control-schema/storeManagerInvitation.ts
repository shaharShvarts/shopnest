import {
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { stores } from "./store";

export const storeManagerInvitations = pgTable(
  "store_manager_invitations",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    email: varchar("email", { length: 320 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("store_manager_invitations_token_hash_unique").on(
      table.tokenHash
    ),
    index("store_manager_invitations_store_email_idx").on(
      table.storeId,
      table.email
    ),
    index("store_manager_invitations_expires_at_idx").on(table.expiresAt),
  ]
);
