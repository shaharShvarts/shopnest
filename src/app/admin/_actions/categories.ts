"use server";

import z from "zod";
import fs from "fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { imageSchema } from "./zod";
import { revalidatePath } from "next/cache";
import { categories } from "@/drizzle/schema";
import { notFound, redirect } from "next/navigation";
import { fileExists } from "@/lib/fileExists";

//   image: z.instanceof(File).optional(),
const zodSchema = z.object({
  name: z.string().min(1, "Name is required"),
  image: imageSchema,
});

const editSchema = zodSchema.extend({
  image: z.instanceof(File).optional(),
});

// This function handles the addition of a new category
export async function addCategory(_: any, formData: FormData) {
  const result = zodSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  const { image, ...rawData } = result.data;

  await fs.mkdir("public/categories", { recursive: true });
  const imageUrl = `/categories/${crypto.randomUUID()}-${image.name}`;
  const fullFilePath = `public${imageUrl}`;
  await fs.writeFile(fullFilePath, Buffer.from(await image.arrayBuffer()));

  // Save category data to the database
  try {
    await db.insert(categories).values({ ...rawData, imageUrl });
  } catch (error: unknown) {
    if (await fileExists(fullFilePath)) {
      await fs.unlink(fullFilePath);
    }

    let errorMessage = "Something went wrong.";

    if (error instanceof Error) {
      const err = error as any;
      // Unique constraint violation and clean up the uploaded image
      if (err.cause.code === "23505") {
        errorMessage = `A category with this name already exists. Try a different name!`;
      } else {
        errorMessage = error.message || "An unexpected error occurred.";
      }
    }

    return {
      success: false,
      errors: {
        name: [errorMessage],
      },
    };
  }
  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

// This function handles the editing of an existing category
export async function editCategory(id: number, _: any, formData: FormData) {
  const result = editSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  const { image, ...rawData } = result.data;

  // Fetch the existing category from the database
  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, Number(id)))
    .limit(1);

  let imageUrl = category?.imageUrl ?? "";
  const fullFilePath = `public${imageUrl}`;

  if (image != null && image.size > 0) {
    if (await fileExists(fullFilePath)) {
      await fs.unlink(fullFilePath);
    }

    imageUrl = `/categories/${crypto.randomUUID()}-${image.name}`;
    const newFilePath = `public${imageUrl}`; // recompute path
    await fs.writeFile(newFilePath, Buffer.from(await image.arrayBuffer()));
  }

  // Update category data to the database
  try {
    await db
      .update(categories)
      .set({ ...rawData, imageUrl })
      .where(eq(categories.id, Number(id)));
  } catch (error: unknown) {
    const newFilePath = `public${imageUrl}`; // recompute path
    if (await fileExists(newFilePath)) {
      await fs.unlink(newFilePath);
    }

    let errorMessage = "Something went wrong.";

    if (error instanceof Error) {
      const err = error as any;
      // Unique constraint violation and clean up the uploaded image
      if (err.cause.code === "23505") {
        errorMessage = `A category with this name already exists. Try a different name!`;
      } else {
        errorMessage = error.message || "An unexpected error occurred.";
      }
    }

    return {
      success: false,
      errors: {
        name: [errorMessage],
      },
    };
  }
  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

export async function ToggleCategoryActive(id: number, active: boolean) {
  await db
    .update(categories)
    .set({ isActive: active })
    .where(eq(categories.id, Number(id)));

  // Redirect to the categories page after successful update
  revalidatePath("/admin/categories");
}

// This function handles the deletion of a category
export async function deleteCategory(id: number): Promise<string> {
  const [category] = await db
    .delete(categories)
    .where(eq(categories.id, Number(id)))
    .returning();

  if (!category) notFound();

  const imageUrl = category?.imageUrl ?? "";

  const fullFilePath = `public${imageUrl}`;

  // Delete the image file from the server
  if (await fileExists(fullFilePath)) {
    await fs.unlink(fullFilePath);
  }

  revalidatePath("/admin/categories");
  return `Category ${category.name} was successfully deleted.`;
}
