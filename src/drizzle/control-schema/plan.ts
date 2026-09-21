import {
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { planStatusEnum } from "./shared";

export const plans = pgTable(
  "plans",
  {
    id: serial("id").primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    status: planStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [uniqueIndex("plans_code_unique").on(table.code)]
);
