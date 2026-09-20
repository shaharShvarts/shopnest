import {
  integer,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { merchantAccounts } from "./merchantAccount";
import { organizations } from "./organization";

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    merchantAccountId: integer("merchant_account_id")
      .notNull()
      .references(() => merchantAccounts.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull().default("owner"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.organizationId, table.merchantAccountId],
    }),
  ]
);
