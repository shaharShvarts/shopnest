import { pgTable, serial, text, varchar, boolean } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createdAt, deletedAt, updatedAt } from "../schemaHelpers";
import { subcategories } from "./subcategory";
import { products } from "./product";

// CATEGORIES
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull().unique(),
  imageUrl: text("image_url").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  deletedAt,
  createdAt,
  updatedAt,
});

export type Category = typeof categories.$inferSelect;

// Category Relations
export const categoriesRelations = relations(categories, ({ many }) => ({
  subcategories: many(subcategories),
  products: many(products),
}));
