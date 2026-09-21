import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./organization";
import { storeStatusEnum } from "./shared";
import { controlPlaneTenants } from "./tenant";

export const stores = pgTable(
  "stores",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 63 }).notNull(),
    status: storeStatusEnum("status").notNull().default("draft"),
    tenantId: integer("tenant_id").references(() => controlPlaneTenants.id),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deleteFinalizesAt: timestamp("delete_finalizes_at", { withTimezone: true }),
    slugReleasedAt: timestamp("slug_released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      "stores_status_tenant_consistency",
      sql`(
        (${table.status} = 'provisioned' AND ${table.tenantId} IS NOT NULL)
        OR
        (${table.status} IN ('draft', 'ready_for_provisioning') AND ${table.tenantId} IS NULL)
      )`
    ),
    check(
      "stores_delete_window_consistency",
      sql`(
        (${table.deletedAt} IS NULL AND ${table.deleteFinalizesAt} IS NULL)
        OR
        (${table.deletedAt} IS NOT NULL AND ${table.deleteFinalizesAt} IS NOT NULL)
      )`
    ),
    check(
      "stores_slug_release_requires_delete",
      sql`${table.slugReleasedAt} IS NULL OR ${table.deletedAt} IS NOT NULL`
    ),
    check(
      "stores_delete_finalizes_after_delete",
      sql`${table.deleteFinalizesAt} IS NULL OR ${table.deleteFinalizesAt} >= ${table.deletedAt}`
    ),
    uniqueIndex("stores_slug_reserved_unique")
      .on(table.slug)
      .where(sql`${table.slugReleasedAt} IS NULL`),
    uniqueIndex("stores_tenant_id_unique")
      .on(table.tenantId)
      .where(sql`${table.tenantId} IS NOT NULL`),
    index("stores_organization_id_idx").on(table.organizationId),
  ]
);
