import {
  pgTable,
  serial,
  integer,
  varchar,
  text,
  boolean,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createdAt, deletedAt, updatedAt } from "../schemaHelpers";
import { categories } from "./category";
import { products } from "./product";

// SUBCATEGORIES
export const subcategories = pgTable("subcategories", {
  id: serial("id").primaryKey(),
  name: varchar("name").notNull().unique(),
  imageUrl: text("image_url").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  categoryId: integer("category_id")
    .references(() => categories.id, { onDelete: "restrict" })
    .notNull(),
  deletedAt,
  createdAt,
  updatedAt,
});

export type Subcategory = typeof subcategories.$inferSelect;

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
