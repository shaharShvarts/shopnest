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
import { stores } from "./store";

export const storeDomainClaimStatuses = [
  "pending_verification",
  "verified",
  "expired",
  "consumed",
  "cancelled",
] as const;

export type StoreDomainClaimStatus =
  (typeof storeDomainClaimStatuses)[number];

export const storeDomainClaims = pgTable(
  "store_domain_claims",
  {
    id: serial("id").primaryKey(),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    hostname: varchar("hostname", { length: 253 }).notNull(),
    status: varchar("status", { length: 32 })
      .$type<StoreDomainClaimStatus>()
      .notNull()
      .default("pending_verification"),
    verificationTokenHash: varchar("verification_token_hash", {
      length: 64,
    }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
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
      "store_domain_claims_status_check",
      sql`${table.status} IN ('pending_verification', 'verified', 'expired', 'consumed', 'cancelled')`
    ),
    check(
      "store_domain_claims_hostname_canonical_check",
      sql`${table.hostname} = lower(${table.hostname}) AND ${table.hostname} !~ '\\.$'`
    ),
    check(
      "store_domain_claims_token_hash_check",
      sql`${table.verificationTokenHash} ~ '^[a-f0-9]{64}$'`
    ),
    check(
      "store_domain_claims_verified_at_check",
      sql`${table.status} NOT IN ('verified', 'consumed') OR ${table.verifiedAt} IS NOT NULL`
    ),
    check(
      "store_domain_claims_consumed_at_check",
      sql`${table.status} <> 'consumed' OR ${table.consumedAt} IS NOT NULL`
    ),
    uniqueIndex("store_domain_claims_pending_store_hostname_unique")
      .on(table.storeId, table.hostname)
      .where(sql`${table.status} = 'pending_verification'`),
    index("store_domain_claims_store_id_idx").on(table.storeId),
    index("store_domain_claims_hostname_idx").on(table.hostname),
    index("store_domain_claims_status_expires_idx").on(
      table.status,
      table.expiresAt
    ),
  ]
);
