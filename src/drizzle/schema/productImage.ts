import { pgTable, integer, primaryKey } from "drizzle-orm/pg-core";
import { products } from "./product";
import { relations } from "drizzle-orm";
import { createdAt } from "../schemaHelpers";
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
    createdAt,
  },
  (table) => [primaryKey({ columns: [table.productId, table.imageId] })]
);

export const productTagsRelations = relations(productImages, ({ one }) => ({
  product: one(products, {
    fields: [productImages.productId],
    references: [products.id],
  }),
  image: one(images, {
    fields: [productImages.imageId],
    references: [images.id],
  }),
}));
