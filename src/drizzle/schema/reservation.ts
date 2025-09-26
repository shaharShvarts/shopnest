import {
  pgTable,
  timestamp,
  integer,
  index,
  varchar,
} from "drizzle-orm/pg-core";
import { products, users } from "../schema";
import { relations } from "drizzle-orm";
import { id } from "../schemaHelpers";

export const reservations = pgTable(
  "reservations",
  {
    id: id(),
    userId: varchar("user_id").notNull(),
    type: varchar("type").notNull().default("Watch"),
    productId: integer("product_id").notNull(),
    quantity: integer("quantity").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (table) => [index("product_expiry_idx").on(table.productId, table.expiresAt)]
);

export type Reservation = typeof reservations.$inferSelect;

export const reservationRelations = relations(reservations, ({ one }) => ({
  user: one(users, {
    fields: [reservations.userId],
    references: [users.id],
  }),
  product: one(products, {
    fields: [reservations.productId],
    references: [products.id],
  }),
}));
