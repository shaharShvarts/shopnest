import { pgTable, serial, timestamp, varchar } from "drizzle-orm/pg-core";
import { merchantStatusEnum } from "./shared";

export const merchantAccounts = pgTable("merchant_accounts", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 320 }).notNull(),
  emailNormalized: varchar("email_normalized", { length: 320 })
    .notNull()
    .unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  phoneE164: varchar("phone_e164", { length: 32 }),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  status: merchantStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
