import { pgTable, uuid, timestamp, integer, index } from "drizzle-orm/pg-core";

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull(),
    productId: uuid("product_id").notNull(),
    quantity: integer("quantity").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [index("product_expiry_idx").on(table.productId, table.expiresAt)]
);
