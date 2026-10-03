import {
  index,
  integer,
  pgTable,
  primaryKey,
  timestamp,
} from "drizzle-orm/pg-core";
import { adminUsers } from "./adminUser";
import { stores } from "./store";

export const storeManagerAssignments = pgTable(
  "store_manager_assignments",
  {
    storeId: integer("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    adminUserId: integer("admin_user_id")
      .notNull()
      .references(() => adminUsers.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.storeId, table.adminUserId] }),
    index("store_manager_assignments_admin_user_id_idx").on(
      table.adminUserId
    ),
  ]
);
