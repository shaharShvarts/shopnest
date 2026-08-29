import { Product } from "@/drizzle/schema";

export type ProductPreview = Pick<
  Product,
  "id" | "name" | "description" | "price" | "imageUrl" | "quantity"
> & {
  inventoryStatus?:
    | "in_stock"
    | "low_stock"
    | "critical_stock"
    | "out_of_stock";
};
