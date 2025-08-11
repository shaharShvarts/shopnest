import {
  pgTable,
  serial,
  text,
  integer,
  varchar,
  check,
  boolean,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createdAt, deletedAt, updatedAt } from "../schemaHelpers";
import { categories } from "./category";
import { subcategories } from "./subcategory";
import { cartProducts } from "./cartProduct";
import { likes } from "./like";
import { orderProducts } from "./orderProduct";
import { productTags } from "./productTag";

// PRODUCTS
export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    name: varchar("name").notNull(),
    price: integer("price").notNull(),
    quantity: integer("quantity").notNull(),
    description: text("description"),
    imageUrl: text("image_url").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    isAvailable: boolean("is_available").notNull().default(true),
    categoryId: integer("category_id")
      .references(() => categories.id, { onDelete: "restrict" })
      .notNull(),
    subcategoryId: integer("subcategory_id").references(
      () => subcategories.id,
      { onDelete: "restrict" }
    ),
    deletedAt,
    createdAt,
    updatedAt,
  },
  (table) => [check("quantity_positive", sql`${table.quantity} > 0`)]
);

export type Product = typeof products.$inferSelect;

// Product Relations
export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, {
    fields: [products.categoryId],
    references: [categories.id],
  }),
  subcategory: one(subcategories, {
    fields: [products.subcategoryId],
    references: [subcategories.id],
  }),
  cartProducts: many(cartProducts),
  likes: many(likes),
  orderProducts: many(orderProducts),
  productTags: many(productTags),
}));
