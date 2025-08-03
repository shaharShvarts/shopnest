import { pgTable, integer, pgEnum } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createdAt, id, updatedAt } from "../schemaHelpers";
import { users } from "./user";
import { cartProducts } from "./cartProduct";

export const cartStatus = ["active", "inactive"] as const;
export type CartStatus = (typeof cartStatus)[number];
export const cartStatusEnum = pgEnum("cart_status", cartStatus);

// CARTS
export const carts = pgTable("carts", {
  id: id(),
  status: cartStatusEnum("status").notNull().default("active"),
  userId: integer("user_id")
    .references(() => users.id)
    .notNull(),
  session_id: integer("session_id").notNull(),
  createdAt,
  updatedAt,
});

// Cart Relations
export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, { fields: [carts.userId], references: [users.id] }),
  cartProducts: many(cartProducts),
}));
