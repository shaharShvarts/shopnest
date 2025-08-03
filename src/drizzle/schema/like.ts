import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createdAt } from "../schemaHelpers";
import { users } from "./user";
import { products } from "./product";

// LIKES
export const likes = pgTable(
  "likes",
  {
    userId: integer("user_id").notNull(),
    productId: integer("product_id").notNull(),
    createdAt,
  },
  (table) => [primaryKey({ columns: [table.userId, table.productId] })]
);

// Likes Relations
export const likesRelations = relations(likes, ({ one }) => ({
  user: one(users, { fields: [likes.userId], references: [users.id] }),
  product: one(products, {
    fields: [likes.productId],
    references: [products.id],
  }),
}));
