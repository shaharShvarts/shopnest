import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { controlPlaneTenants } from "./tenant";

export const storeDomainTypes = ["custom"] as const;
export type StoreDomainType = (typeof storeDomainTypes)[number];

export const storeDomainProviders = ["cloudflare"] as const;
export type StoreDomainProvider = (typeof storeDomainProviders)[number];

export const storeDomainStatuses = [
  "pending_verification",
  "verified",
  "active",
  "failed",
  "removed",
] as const;
export type StoreDomainStatus = (typeof storeDomainStatuses)[number];

export const storeDomainLifecycleRoles = [
  "candidate",
  "primary",
  "retiring",
] as const;
export type StoreDomainLifecycleRole =
  (typeof storeDomainLifecycleRoles)[number];

export const storeDomains = pgTable(
  "store_domains",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => controlPlaneTenants.id),
    hostname: varchar("hostname", { length: 253 }).notNull(),
    type: varchar("type", { length: 32 })
      .$type<StoreDomainType>()
      .notNull()
      .default("custom"),
    status: varchar("status", { length: 32 })
      .$type<StoreDomainStatus>()
      .notNull()
      .default("pending_verification"),
    verificationToken: varchar("verification_token", { length: 128 })
      .notNull()
      .unique(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    lifecycleRole: varchar("lifecycle_role", { length: 32 })
      .$type<StoreDomainLifecycleRole>(),
    cnameVerifiedAt: timestamp("cname_verified_at", { withTimezone: true }),
    lastManualCheckAt: timestamp("last_manual_check_at", {
      withTimezone: true,
    }),
    retireAt: timestamp("retire_at", { withTimezone: true }),
    redirectToDomainId: integer("redirect_to_domain_id"),
    isPrimary: boolean("is_primary").notNull().default(false),
    provider: varchar("provider", { length: 32 }).$type<StoreDomainProvider>(),
    providerHostnameId: varchar("provider_hostname_id", { length: 128 }),
    providerHostnameStatus: varchar("provider_hostname_status", { length: 64 }),
    providerSslStatus: varchar("provider_ssl_status", { length: 64 }),
    providerLastSyncedAt: timestamp("provider_last_synced_at", {
      withTimezone: true,
    }),
    providerLastErrorCode: varchar("provider_last_error_code", { length: 128 }),
    providerLastErrorAt: timestamp("provider_last_error_at", {
      withTimezone: true,
    }),
    activationRequestedAt: timestamp("activation_requested_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check("store_domains_type_check", sql`${table.type} IN ('custom')`),
    check(
      "store_domains_status_check",
      sql`${table.status} IN ('pending_verification', 'verified', 'active', 'failed', 'removed')`
    ),
    check(
      "store_domains_verified_status_check",
      sql`${table.status} NOT IN ('verified', 'active') OR ${table.verifiedAt} IS NOT NULL`
    ),
    check(
      "store_domains_hostname_canonical_check",
      sql`${table.hostname} = lower(${table.hostname}) AND ${table.hostname} !~ '\\.$'`
    ),
    check(
      "store_domains_provider_check",
      sql`${table.provider} IS NULL OR ${table.provider} IN ('cloudflare')`
    ),
    check(
      "store_domains_provider_id_requires_provider_check",
      sql`${table.providerHostnameId} IS NULL OR ${table.provider} IS NOT NULL`
    ),
    check(
      "store_domains_lifecycle_role_check",
      sql`${table.lifecycleRole} IS NULL OR ${table.lifecycleRole} IN ('candidate', 'primary', 'retiring')`
    ),
    check(
      "store_domains_lifecycle_removed_check",
      sql`(${table.status} = 'removed' AND ${table.lifecycleRole} IS NULL AND ${table.isPrimary} = false) OR (${table.status} <> 'removed' AND ${table.lifecycleRole} IS NOT NULL)`
    ),
    check(
      "store_domains_primary_flag_consistency",
      sql`${table.isPrimary} = (${table.lifecycleRole} = 'primary')`
    ),
    check(
      "store_domains_retiring_metadata_check",
      sql`(${table.lifecycleRole} = 'retiring' AND ${table.retireAt} IS NOT NULL AND ${table.redirectToDomainId} IS NOT NULL) OR (${table.lifecycleRole} <> 'retiring' AND ${table.retireAt} IS NULL AND ${table.redirectToDomainId} IS NULL) OR (${table.lifecycleRole} IS NULL AND ${table.retireAt} IS NULL AND ${table.redirectToDomainId} IS NULL)`
    ),
    check(
      "store_domains_redirect_not_self",
      sql`${table.redirectToDomainId} IS NULL OR ${table.redirectToDomainId} <> ${table.id}`
    ),
    uniqueIndex("store_domains_hostname_bound_unique")
      .on(table.hostname)
      .where(sql`${table.status} <> 'removed'`),
    uniqueIndex("store_domains_primary_tenant_unique")
      .on(table.tenantId)
      .where(
        sql`${table.lifecycleRole} = 'primary' AND ${table.status} <> 'removed'`
      ),
    uniqueIndex("store_domains_candidate_tenant_unique")
      .on(table.tenantId)
      .where(
        sql`${table.lifecycleRole} = 'candidate' AND ${table.status} <> 'removed'`
      ),
    index("store_domains_retire_at_idx")
      .on(table.retireAt)
      .where(
        sql`${table.lifecycleRole} = 'retiring' AND ${table.status} <> 'removed'`
      ),
    index("store_domains_tenant_id_idx").on(table.tenantId),
    index("store_domains_status_idx").on(table.status),
    uniqueIndex("store_domains_provider_hostname_id_unique")
      .on(table.providerHostnameId)
      .where(sql`${table.providerHostnameId} IS NOT NULL`),
    index("store_domains_provider_idx").on(table.provider),
  ]
);
