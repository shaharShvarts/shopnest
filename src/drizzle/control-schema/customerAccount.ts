import { pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { customerStatusEnum } from "./shared";

export const customerAccounts = pgTable("customer_accounts", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  emailNormalized: varchar("email_normalized", { length: 320 })
    .notNull()
    .unique(),
  passwordHash: varchar("password_hash", { length: 255 }),
  displayName: varchar("display_name", { length: 160 }),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  status: customerStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
