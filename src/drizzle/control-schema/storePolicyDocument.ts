import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./organization";
import { stores } from "./store";

export const storePolicyDocuments = pgTable(
  "store_policy_documents",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id),
    market: varchar("market", { length: 2 }).notNull(),
    policyType: varchar("policy_type", { length: 64 }).notNull(),
    version: integer("version").notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    content: text("content").notNull(),
    status: varchar("status", { length: 16 }).notNull().default("draft"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
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
      "store_policy_documents_status_check",
      sql`${table.status} IN ('draft', 'published')`
    ),
    check(
      "store_policy_documents_version_positive",
      sql`${table.version} > 0`
    ),
    check(
      "store_policy_documents_publish_consistency",
      sql`(
        (${table.status} = 'draft' AND ${table.publishedAt} IS NULL)
        OR
        (${table.status} = 'published' AND ${table.publishedAt} IS NOT NULL)
      )`
    ),
    uniqueIndex("store_policy_documents_version_unique").on(
      table.storeId,
      table.market,
      table.policyType,
      table.version
    ),
    index("store_policy_documents_store_idx").on(table.storeId),
    index("store_policy_documents_organization_idx").on(table.organizationId),
    index("store_policy_documents_published_idx").on(
      table.storeId,
      table.market,
      table.policyType,
      table.status
    ),
  ]
);
