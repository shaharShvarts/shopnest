import { pgTable, serial, integer, varchar } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createdAt, deletedAt, updatedAt } from "../schemaHelpers";
import { categories } from "./category";
import { products } from "./product";

// SUBCATEGORIES
export const subcategories = pgTable("subcategories", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull(),
  title: varchar("title").notNull(),
  categoryId: integer("category_id")
    .references(() => categories.id, { onDelete: "cascade" })
    .notNull(),
  deletedAt,
  createdAt,
  updatedAt,
});

// Subcategory Relations
export const subcategoriesRelations = relations(
  subcategories,
  ({ one, many }) => ({
    category: one(categories, {
      fields: [subcategories.categoryId],
      references: [categories.id],
    }),
    products: many(products),
  })
);
