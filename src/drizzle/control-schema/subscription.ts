import {
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./organization";
import { plans } from "./plan";
import { stores } from "./store";
import { subscriptionStatusEnum } from "./shared";
import { controlPlaneTenants } from "./tenant";

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    storeId: integer("store_id").references(() => stores.id),
    tenantId: integer("tenant_id").references(() => controlPlaneTenants.id),
    planId: integer("plan_id")
      .notNull()
      .references(() => plans.id),
    status: subscriptionStatusEnum("status").notNull().default("pending"),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodStart: timestamp("current_period_start", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAt: timestamp("cancel_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("subscriptions_store_id_unique")
      .on(table.storeId)
      .where(sql`${table.storeId} IS NOT NULL`),
    index("subscriptions_organization_id_idx").on(table.organizationId),
    index("subscriptions_tenant_id_idx").on(table.tenantId),
    index("subscriptions_plan_id_idx").on(table.planId),
  ]
);
