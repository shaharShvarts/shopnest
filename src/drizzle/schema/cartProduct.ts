import { pgTable, integer, check, primaryKey, uuid } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createdAt, updatedAt } from "../schemaHelpers";
import { carts } from "./cart";
import { products } from "./product";

// CART PRODUCTS
export const cartProducts = pgTable(
  "cart_products",
  {
    cartId: uuid("cart_id")
      .references(() => carts.id, { onDelete: "cascade" })
      .notNull(),
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    quantity: integer("quantity").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    check("quantity_positive", sql`${table.quantity} > 0`),
    primaryKey({ columns: [table.cartId, table.productId] }),
  ]
);

// CartItem Relations
export const cartItemsRelations = relations(cartProducts, ({ one }) => ({
  cart: one(carts, { fields: [cartProducts.cartId], references: [carts.id] }),
  product: one(products, {
    fields: [cartProducts.productId],
    references: [products.id],
  }),
}));
