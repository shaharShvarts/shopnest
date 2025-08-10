import { relations } from "drizzle-orm";
import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { createdAt } from "../schemaHelpers";
import { productImages } from "./productImage";

export const images = pgTable("images", {
  id: serial("id").primaryKey(),
  imageUrl: text("image_url").notNull(),
  createdAt,
});

export const tagRelations = relations(images, ({ many }) => ({
  productImage: many(productImages),
}));
