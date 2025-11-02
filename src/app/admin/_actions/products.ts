"use server";

import z from "zod";
import fs from "fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { imageSchema } from "./zod";
import { revalidatePath } from "next/cache";
import { products } from "@/drizzle/schema";
import { fileExists } from "@/lib/fileExists";
import { notFound, redirect } from "next/navigation";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  price: z.coerce.number().int().min(0, "Price must be a positive number"),
  quantity: z.coerce.number().min(0, "Quantity must be a non-negative number"),
  description: z.string().optional(),
  image: imageSchema,
  categoryId: z.coerce.number().min(0.000001, "Category is required"),
  subcategoryId: z.preprocess((val) => {
    if (val === "" || val === "0" || val === undefined) return null;
    return Number(val);
  }, z.number().int().optional().nullable()),
});

const editSchema = productSchema.extend({
  image: z.instanceof(File).optional(),
});

type DbError = Error & {
  cause?: {
    code?: string;
  };
};

export async function addProduct(_: unknown, formData: FormData) {
  const result = productSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  const { image, ...rawData } = result.data;

  await fs.mkdir("public/products", { recursive: true });
  const imageUrl = `/products/${crypto.randomUUID()}-${image.name}`;
  const fullFilePath = `public${imageUrl}`;
  await fs.writeFile(fullFilePath, Buffer.from(await image.arrayBuffer()));

  try {
    await db.insert(products).values({ ...rawData, imageUrl });
  } catch (error: unknown) {
    if (await fileExists(fullFilePath)) {
      await fs.unlink(fullFilePath);
    }

    let errorMessage = "Something went wrong.";

    const err = error as DbError;

    if (err.cause?.code === "23505") {
      errorMessage =
        "A product with this name already exists. Try a different name!";
    } else if (err.message) {
      errorMessage = err.message;
    }

    return {
      success: false,
      errors: { name: [errorMessage] },
    };
  }

  revalidatePath("/");
  revalidatePath("/products");
  redirect("/admin/products");
}

export async function editProduct(id: number, _: unknown, formData: FormData) {
  const result = editSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  const { image, ...rawData } = result.data;

  const [productRow] = await db
    .select({ imageUrl: products.imageUrl })
    .from(products)
    .where(eq(products.id, Number(id)))
    .limit(1);

  let imageUrl = productRow?.imageUrl ?? "";
  const fullFilePath = `public${imageUrl}`;

  if (image != null && image.size > 0) {
    if (await fileExists(fullFilePath)) {
      await fs.unlink(fullFilePath);
    }

    imageUrl = `/products/${crypto.randomUUID()}-${image.name}`;
    const newFilePath = `public${imageUrl}`;
    await fs.writeFile(newFilePath, Buffer.from(await image.arrayBuffer()));
  }

  try {
    await db
      .update(products)
      .set({ ...rawData, imageUrl })
      .where(eq(products.id, id));
  } catch (error: unknown) {
    const newFilePath = `public${imageUrl}`;
    if (await fileExists(newFilePath)) {
      await fs.unlink(newFilePath);
    }

    let errorMessage = "Something went wrong.";
    const err = error as DbError;

    if (err.cause?.code === "23505") {
      errorMessage =
        "A product with this name already exists. Try a different name!";
    } else if (err.message) {
      errorMessage = err.message;
    }

    return {
      success: false,
      errors: { name: [errorMessage] },
    };
  }

  revalidatePath("/");
  revalidatePath("/products");
  redirect("/admin/products");
}

export async function ToggleProductActive(id: number, active: boolean) {
  await db
    .update(products)
    .set({ isActive: active })
    .where(eq(products.id, Number(id)));

  revalidatePath("/");
  revalidatePath("/products");
}

export async function deleteProduct(id: number): Promise<string> {
  const [productRow] = await db
    .delete(products)
    .where(eq(products.id, Number(id)))
    .returning();

  if (!productRow) notFound();

  const imageUrl = productRow?.imageUrl ?? "";

  const fullFilePath = `public${imageUrl}`;

  if (await fileExists(fullFilePath)) {
    await fs.unlink(fullFilePath);
  }

  revalidatePath("/");
  revalidatePath("/products");
  return `product ${productRow.name} was successfully deleted.`;
}
