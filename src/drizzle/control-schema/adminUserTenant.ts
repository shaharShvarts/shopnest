import {
  integer,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { adminUsers } from "./adminUser";
import { controlPlaneTenants } from "./tenant";

export const adminUserTenants = pgTable(
  "admin_user_tenants",
  {
    adminUserId: integer("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    tenantSlug: varchar("tenant_slug", { length: 63 })
      .notNull()
      .references(() => controlPlaneTenants.slug, { onDelete: "cascade" }),
    role: varchar("role", { length: 32 }).notNull().default("tenant_admin"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.adminUserId, table.tenantSlug] })]
);
