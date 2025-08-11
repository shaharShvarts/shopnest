"use server";

import z from "zod";
import fs from "fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { imageSchema } from "./zod";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { products } from "@/drizzle/schema";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  price: z.coerce.number().int().min(0, "Price must be a positive number"),
  quantity: z.coerce.number().min(0, "Quantity must be a non-negative number"),
  description: z.string().optional(),
  image: imageSchema,
  categoryId: z.coerce.number().int().min(1, "Category is required"),
  subcategoryId: z.coerce.number().int().optional(),
});

const editSchema = productSchema.extend({
  image: z.instanceof(File).optional(),
});

export async function addProduct(_: any, formData: FormData) {
  const result = productSchema.safeParse(Object.fromEntries(formData));
  console.log(result);
  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  let imageUrl = "";
  const { name, price, quantity, description, image, categoryId } = result.data;

  await fs.mkdir("public/products", { recursive: true });
  imageUrl = `/products/${crypto.randomUUID()}-${image.name}`;
  await fs.writeFile(
    `public${imageUrl}`,
    Buffer.from(await image.arrayBuffer())
  );

  // Save product data to the database
  try {
    await db.insert(products).values({
      name,
      price,
      quantity,
      description,
      imageUrl,
      categoryId,
    });
  } catch (error: unknown) {
    await fs.unlink(`public${imageUrl}`);
    let errorMessage = "Something went wrong.";

    if (error instanceof Error) {
      const err = error as any;
      // Unique constraint violation and clean up the uploaded image
      if (err.cause.code === "23505") {
        errorMessage = `A product with this name (${name}) already exists. Try a different name!`;
      } else {
        errorMessage = error.message || "An unexpected error occurred.";
      }
    }

    return {
      success: false,
      errors: { name: [errorMessage] },
    };
  }

  // Redirect to the products page after successful addition
  redirect("/admin/products");
}

export async function editProduct(id: number, _: any, formData: FormData) {
  const data = Object.fromEntries(formData);
  const result = editSchema.safeParse(data);

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  const { name, price, quantity, description, image, categoryId } = result.data;

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, Number(id)))
    .limit(1);

  if (!product) notFound();

  let imageUrl = product.imageUrl;
  if (image != null && image.size > 0) {
    if (product?.imageUrl !== "undefined") {
      await fs.unlink(`public${product.imageUrl}`);
    }

    imageUrl = `/products/${crypto.randomUUID()}-${image.name}`;
    await fs.writeFile(
      `public${imageUrl}`,
      Buffer.from(await image.arrayBuffer())
    );
  }

  // Update product data in the database
  try {
    await db
      .update(products)
      .set({ name, price, quantity, description, imageUrl, categoryId })
      .where(eq(products.id, id));
    revalidatePath("/admin/products");
  } catch (error: unknown) {
    await fs.unlink(`public${imageUrl}`);
    let errorMessage = "Something went wrong.";

    if (error instanceof Error) {
      const err = error as any;
      // Unique constraint violation and clean up the uploaded image
      if (err.cause.code === "23505") {
        errorMessage = `A product with this name (${name}) already exists. Try a different name!`;
      } else {
        errorMessage = error.message || "An unexpected error occurred.";
      }
    }

    return {
      success: false,
      errors: { name: [errorMessage] },
    };
  }

  // Redirect to the products page after successful edit
  redirect("/admin/products");
}

export async function ToggleProductActive(id: number, active: boolean) {
  await db
    .update(products)
    .set({ isActive: active })
    .where(eq(products.id, Number(id)));

  revalidatePath("/");
  revalidatePath("/admin/products");
  redirect("/admin/products");
}

export async function deleteProduct(id: number): Promise<string> {
  const [product] = await db
    .delete(products)
    .where(eq(products.id, Number(id)))
    .returning();

  // Delete the image file from the server
  await fs.unlink(`public/${product.imageUrl}`);
  revalidatePath("/admin/products");
  return `product ${product.name} was successfully deleted.`;
}
