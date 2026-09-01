import { integer, pgTable, primaryKey, timestamp, varchar } from "drizzle-orm/pg-core";
import { customerAccounts } from "./customerAccount";
import { controlPlaneTenants } from "./tenant";

export const customerTenants = pgTable(
  "customer_tenants",
  {
    customerId: integer("customer_id")
      .notNull()
      .references(() => customerAccounts.id, { onDelete: "cascade" }),
    tenantSlug: varchar("tenant_slug", { length: 63 })
      .notNull()
      .references(() => controlPlaneTenants.slug, { onDelete: "cascade" }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.customerId, table.tenantSlug] })]
);
