import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createdAt, id } from "../schemaHelpers";
import { products } from "./product";

export const inventoryAlertTypes = [
  "low_stock",
  "critical_stock",
  "out_of_stock",
] as const;
export type InventoryAlertType = (typeof inventoryAlertTypes)[number];
export const inventoryAlertTypeEnum = pgEnum(
  "inventory_alert_type",
  inventoryAlertTypes
);

export const inventoryNotificationStatuses = [
  "pending",
  "sent",
  "failed",
  "not_configured",
] as const;
export type InventoryNotificationStatus =
  (typeof inventoryNotificationStatuses)[number];
export const inventoryNotificationStatusEnum = pgEnum(
  "inventory_notification_status",
  inventoryNotificationStatuses
);

export const inventoryAlerts = pgTable(
  "inventory_alerts",
  {
    id: id(),
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    alertType: inventoryAlertTypeEnum("alert_type").notNull(),
    availableQuantity: integer("available_quantity").notNull(),
    threshold: integer("threshold").notNull(),
    notificationStatus: inventoryNotificationStatusEnum("notification_status")
      .notNull()
      .default("not_configured"),
    createdAt,
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    check(
      "inventory_alert_available_non_negative",
      sql`${table.availableQuantity} >= 0`
    ),
    check(
      "inventory_alert_threshold_non_negative",
      sql`${table.threshold} >= 0`
    ),
    uniqueIndex("inventory_alert_unresolved_unique")
      .on(table.productId, table.alertType)
      .where(sql`${table.resolvedAt} is null`),
    index("inventory_alert_product_type_resolved_idx").on(
      table.productId,
      table.alertType,
      table.resolvedAt
    ),
  ]
);

export type InventoryAlert = typeof inventoryAlerts.$inferSelect;

export const inventoryAlertRelations = relations(
  inventoryAlerts,
  ({ one }) => ({
    product: one(products, {
      fields: [inventoryAlerts.productId],
      references: [products.id],
    }),
  })
);
