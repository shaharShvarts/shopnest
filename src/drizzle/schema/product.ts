import {
  pgTable,
  serial,
  text,
  integer,
  varchar,
  check,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createdAt, deletedAt, updatedAt } from "../schemaHelpers";
import { categories } from "./category";
import { subcategories } from "./subcategory";
import { cartProducts } from "./cartProduct";
import { likes } from "./like";
import { orderProducts } from "./orderProduct";
import { productTags } from "./productTag";
import { boolean } from "drizzle-orm/gel-core";

// Product Status Enum
export const productStatus = ["available", "unavailable"] as const;
export type ProductStatus = (typeof productStatus)[number];
export const productStatusEnum = pgEnum("product_status", productStatus);

// Product Status Enum for availability
export const isAvailable = ["active", "inactive"] as const;
export type IsAvailable = (typeof isAvailable)[number];
export const isAvailableEnum = pgEnum("is_Available", isAvailable);

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
    status: productStatusEnum().notNull().default("available"),
    isAvailable: isAvailableEnum("is_available").notNull().default("active"),
    categoryId: integer("category_id")
      .references(() => categories.id, { onDelete: "cascade" })
      .notNull(),
    subcategoryId: integer("subcategory_id").references(
      () => subcategories.id,
      { onDelete: "cascade" }
    ),
    deletedAt,
    createdAt,
    updatedAt,
  },
  (table) => [check("quantity_positive", sql`${table.quantity} > 0`)]
);

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
