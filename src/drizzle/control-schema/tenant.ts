import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  varchar,
  text,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenantPlanEnum, tenantStatusEnum } from "./shared";

export const controlPlaneTenants = pgTable(
  "tenants",
  {
    id: serial("id").primaryKey(),
    slug: varchar("slug", { length: 63 }).notNull().unique(),
    schemaName: varchar("schema_name", { length: 63 }).notNull().unique(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    status: tenantStatusEnum("status").notNull().default("active"),
    plan: tenantPlanEnum("plan").notNull().default("small"),
    featured: boolean("featured").notNull().default(false),
    featuredRank: integer("featured_rank"),
    supportNotes: text("support_notes"),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    suspendedReason: text("suspended_reason"),
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
      "tenants_featured_rank_positive",
      sql`${table.featuredRank} IS NULL OR ${table.featuredRank} > 0`
    ),
    check(
      "tenants_unfeatured_rank_null",
      sql`${table.featured} OR ${table.featuredRank} IS NULL`
    ),
    index("tenants_featured_rank_idx").on(table.featured, table.featuredRank),
  ]
);
