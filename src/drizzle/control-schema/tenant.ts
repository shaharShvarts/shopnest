import { pgTable, serial, timestamp, varchar, text } from "drizzle-orm/pg-core";
import { tenantStatusEnum } from "./shared";

export const controlPlaneTenants = pgTable("tenants", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 63 }).notNull().unique(),
  schemaName: varchar("schema_name", { length: 63 }).notNull().unique(),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  status: tenantStatusEnum("status").notNull().default("active"),
  suspendedAt: timestamp("suspended_at", { withTimezone: true }),
  suspendedReason: text("suspended_reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
