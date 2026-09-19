import { pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  legalName: varchar("legal_name", { length: 200 }),
  businessNumber: varchar("business_number", { length: 64 }),
  vatNumber: varchar("vat_number", { length: 64 }),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 64 }),
  country: varchar("country", { length: 2 }).notNull().default("IL"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
