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

export const storeDomains = pgTable(
  "store_domains",
  {
    id: serial("id").primaryKey(),
    tenantId: integer("tenant_id")
      .notNull()
      .references(() => controlPlaneTenants.id),
    hostname: varchar("hostname", { length: 253 }).notNull().unique(),
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
      sql`${table.hostname} = lower(${table.hostname}) AND ${table.hostname} !~ '\\.      .on(table.tenantId)
      .where(sql`${table.isPrimary} AND ${table.status} <> 'removed'`),
    index("store_domains_tenant_id_idx").on(table.tenantId),
    index("store_domains_status_idx").on(table.status),
    uniqueIndex("store_domains_provider_hostname_id_unique")
      .on(table.providerHostnameId)
      .where(sql`${table.providerHostnameId} IS NOT NULL`),
    index("store_domains_provider_idx").on(table.provider),
  ]
);
`
    ),
    check(
      "store_domains_provider_check",
      sql`${table.provider} IS NULL OR ${table.provider} IN ('cloudflare')`
    ),
    check(
      "store_domains_provider_id_requires_provider_check",
      sql`${table.providerHostnameId} IS NULL OR ${table.provider} IS NOT NULL`
    ),
    uniqueIndex("store_domains_primary_tenant_unique")
      .on(table.tenantId)
      .where(sql`${table.isPrimary} AND ${table.status} <> 'removed'`),
    index("store_domains_tenant_id_idx").on(table.tenantId),
    index("store_domains_status_idx").on(table.status),
  ]
);
