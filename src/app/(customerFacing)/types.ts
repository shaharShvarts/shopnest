import { Product } from "@/drizzle/schema";

export type ProductPreview = Pick<
  Product,
  "id" | "name" | "description" | "price" | "imageUrl"
>;
