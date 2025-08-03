import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { products } from "./product";
import { tags } from "./tag";
import { relations } from "drizzle-orm";
import { createdAt } from "../schemaHelpers";

// PRODUCT TAGS
export const productTags = pgTable(
  "product_tags",
  {
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    tagId: integer("tag_id")
      .references(() => tags.id, { onDelete: "cascade" })
      .notNull(),
    createdAt,
  },
  (table) => [primaryKey({ columns: [table.productId, table.tagId] })]
);

// ProductTag Relations
export const productTagsRelations = relations(productTags, ({ one }) => ({
  product: one(products, {
    fields: [productTags.productId],
    references: [products.id],
  }),
  tag: one(tags, { fields: [productTags.tagId], references: [tags.id] }),
}));
