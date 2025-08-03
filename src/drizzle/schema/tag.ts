import { relations } from "drizzle-orm";
import { pgTable, serial, varchar } from "drizzle-orm/pg-core";
import { productTags } from "./productTag";
import { createdAt } from "../schemaHelpers";

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).unique().notNull(),
  createdAt,
});

export const tagRelations = relations(tags, ({ many }) => ({
  productTags: many(productTags),
}));

//  "on_sale",
//  "pre_order",
//  "back_order",
//  "coming_soon",
//  "limited_edition",
//  "new_arrival",
