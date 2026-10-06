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
import { sql } from "drizzle-orm";
import { organizations } from "./organization";

export const organizationLogoAssets = pgTable(
  "organization_logo_assets",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    filename: varchar("filename", { length: 255 }).notNull(),
    contentType: varchar("content_type", { length: 64 })
      .notNull()
      .default("image/png"),
    byteSize: integer("byte_size").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "organization_logo_assets_byte_size_positive",
      sql`${table.byteSize} > 0`
    ),
    uniqueIndex("organization_logo_assets_org_hash_unique").on(
      table.organizationId,
      table.contentHash
    ),
    index("organization_logo_assets_organization_idx").on(
      table.organizationId
    ),
  ]
);
