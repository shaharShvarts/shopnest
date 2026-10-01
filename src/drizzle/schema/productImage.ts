import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { createdAt } from "../schemaHelpers";
import { products } from "./product";
import { images } from "./image";

export const productImages = pgTable(
  "product_images",
  {
    productId: integer("product_id")
      .references(() => products.id, { onDelete: "cascade" })
      .notNull(),
    imageId: integer("image_id")
      .references(() => images.id, { onDelete: "cascade" })
      .notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt,
  },
  (table) => [
    primaryKey({ columns: [table.productId, table.imageId] }),
    uniqueIndex("product_images_product_sort_unique").on(
      table.productId,
      table.sortOrder
    ),
    index("product_images_product_idx").on(table.productId),
    check("product_images_sort_order_non_negative", sql`${table.sortOrder} >= 0`),
  ]
);

export const productImagesRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
  image: one(images, {
    fields: [productImages.imageId],
    references: [images.id],
  }),
}));

export type ProductImage = typeof productImages.$inferSelect;
