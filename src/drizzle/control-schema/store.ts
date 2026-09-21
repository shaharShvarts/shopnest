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
import { storeStatuses } from "./shared";
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
    status: varchar("status", { length: 32 })
      .$type<(typeof storeStatuses)[number]>()
      .notNull()
      .default("draft"),
    tenantId: integer("tenant_id").references(() => controlPlaneTenants.id),
    activationRequestedAt: timestamp("activation_requested_at", {
      withTimezone: true,
    }),
    provisioningStartedAt: timestamp("provisioning_started_at", {
      withTimezone: true,
    }),
    provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
    lastProvisioningAttemptAt: timestamp("last_provisioning_attempt_at", {
      withTimezone: true,
    }),
    provisioningAttemptCount: integer("provisioning_attempt_count")
      .notNull()
      .default(0),
    lastProvisioningErrorCode: varchar("last_provisioning_error_code", {
      length: 64,
    }),
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
      "stores_status_check",
      sql`${table.status} IN ('draft', 'ready_for_provisioning', 'activation_requested', 'provisioning', 'provisioning_failed', 'provisioned')`
    ),
    check(
      "stores_status_tenant_consistency",
      sql`(
        (${table.status} = 'provisioned' AND ${table.tenantId} IS NOT NULL)
        OR
        (${table.status} <> 'provisioned' AND ${table.tenantId} IS NULL)
      )`
    ),
    check(
      "stores_provisioning_attempt_count_nonnegative",
      sql`${table.provisioningAttemptCount} >= 0`
    ),
    check(
      "stores_provisioned_at_consistency",
      sql`${table.provisionedAt} IS NULL OR ${table.status} = 'provisioned'`
    ),
    check(
      "stores_provisioning_error_code_format",
      sql`${table.lastProvisioningErrorCode} IS NULL OR ${table.lastProvisioningErrorCode} ~ '^[A-Z0-9_]{1,64}
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
`
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
