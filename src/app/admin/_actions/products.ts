"use server";

import z from "zod";
import fs from "fs/promises";
import { redirect } from "next/navigation";
import { db } from "@/drizzle/db";
import { products } from "@/drizzle/schema";
import { imageSchema } from "./zod";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  price: z.coerce.number().int().min(0, "Price must be a positive number"),
  quantity: z.coerce.number().min(0, "Quantity must be a non-negative number"),
  description: z.string().optional(),
  image: imageSchema,
  // categoryId: z.number().int().min(1, "Category is required"),
  // subcategoryId: z.number().int().optional(),
});

export type ProductFormState = {
  success: boolean;
  fields?: Record<string, string>;
  errors?: Record<string, string[]>;
};

export async function addProduct(
  prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const data = Object.fromEntries(formData);
  const result = productSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.flatten().fieldErrors;
    const fields: Record<string, string> = {};
    for (const key in data) {
      fields[key] = data[key].toString();
    }

    return {
      success: false,
      fields,
      errors,
    };
  }

  const { name, price, quantity, description, image } = result.data;

  await fs.mkdir("public/products", { recursive: true });
  const imagePath = `products/${crypto.randomUUID()}-${image.name}`;
  await fs.writeFile(
    `public/${imagePath}`,
    Buffer.from(await image.arrayBuffer())
  );

  // Save product data to the database
  await db.insert(products).values({
    name,
    price,
    quantity,
    description,
    imageUrl: imagePath,
    categoryId: 5, // Example category ID, replace with actual logic
  });

  // Redirect to the products page after successful addition
  redirect("/admin/products");
}
