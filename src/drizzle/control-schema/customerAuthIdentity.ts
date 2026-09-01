import { integer, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { customerAccounts } from "./customerAccount";
import { customerAuthProviderEnum } from "./shared";

export const customerAuthIdentities = pgTable(
  "customer_auth_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customerAccounts.id, { onDelete: "cascade" }),
    provider: customerAuthProviderEnum("provider").notNull(),
    providerAccountId: varchar("provider_account_id", { length: 320 }).notNull(),
    providerEmail: varchar("provider_email", { length: 320 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("customer_auth_provider_account_unique").on(
      table.provider,
      table.providerAccountId
    ),
  ]
);
