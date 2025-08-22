import { pgTable, integer, text, boolean, varchar } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "../schemaHelpers";
import { users } from "./user";
import { cartProducts } from "./cartProduct";
import { relations } from "drizzle-orm";

export const carts = pgTable(
  "carts",
  {
    id: id(),
    isActive: boolean("is_active").notNull().default(true),
    sessionId: varchar("session_id"),
    totalPrice: integer("total_price").default(0).notNull(),
    currency: text("currency").notNull().default("ILS"),
    isAbandoned: boolean("is_abandoned").default(false),
    userId: integer("user_id").references(() => users.id),
    createdAt,
    updatedAt,
  },
  (table) => [
    {
      check: {
        name: "ensure_user_or_session",
        expression: `(user_id IS NOT NULL OR session_id IS NOT NULL)`,
      },
    },
  ]
);

// Cart Relations
export const cartsRelations = relations(carts, ({ one, many }) => ({
  user: one(users, { fields: [carts.userId], references: [users.id] }),
  cartProducts: many(cartProducts),
}));
