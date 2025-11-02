"use server";

import z from "zod";
import fs from "fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { imageSchema } from "./zod";
import { revalidatePath } from "next/cache";
import { fileExists } from "@/lib/fileExists";
import { subcategories } from "@/drizzle/schema";
import { notFound, redirect } from "next/navigation";

const zodSchema = z.object({
  name: z.string().min(1, "Name is required"),
  image: imageSchema,
  categoryId: z.coerce.number().int().positive("Category ID is required"),
});

const editSchema = zodSchema.extend({
  image: z.instanceof(File).optional(),
});

type DbError = Error & {
  cause?: {
    code?: string;
  };
};

// This function handles the addition of a new category
export async function addSubcategory(_: unknown, formData: FormData) {
  const result = zodSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  const { image, ...rawData } = result.data;

  await fs.mkdir("public/subcategories", { recursive: true });
  const imageUrl = `/subcategories/${crypto.randomUUID()}-${image.name}`;
  const fullFilePath = `public${imageUrl}`;
  await fs.writeFile(fullFilePath, Buffer.from(await image.arrayBuffer()));

  // Save category data to the database
  try {
    await db.insert(subcategories).values({ ...rawData, imageUrl });
  } catch (error: unknown) {
    if (await fileExists(fullFilePath)) {
      await fs.unlink(fullFilePath);
    }

    let errorMessage = "Something went wrong.";

    if (error instanceof Error) {
      const err = error as DbError;
      // Unique constraint violation and clean up the uploaded image
      if (err.cause?.code === "23505") {
        errorMessage = `A subcategory with this name already exists. Try a different name!`;
      } else if (err.message) {
        errorMessage = error.message;
      }
    }

    return {
      success: false,
      errors: {
        name: [errorMessage],
      },
    };
  }

  revalidatePath("/");
  revalidatePath("/subcategories");
  redirect("/admin/subcategories");
}

// // This function handles the editing of an existing category
export async function editSubcategory(
  id: number,
  _: unknown,
  formData: FormData
) {
  const result = editSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  const { image, ...rawData } = result.data;

  // Fetch the existing category from the database
  const [subcategory] = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.id, Number(id)))
    .limit(1);

  let imageUrl = subcategory?.imageUrl ?? "";
  const fullFilePath = `public${imageUrl}`;

  if (image != null && image.size > 0) {
    if (await fileExists(fullFilePath)) {
      await fs.unlink(fullFilePath);
    }

    imageUrl = `/subcategories/${crypto.randomUUID()}-${image.name}`;
    const newFilePath = `public${imageUrl}`; // recompute path
    await fs.writeFile(newFilePath, Buffer.from(await image.arrayBuffer()));
  }

  // Update subcategory data to the database
  try {
    await db
      .update(subcategories)
      .set({ ...rawData, imageUrl })
      .where(eq(subcategories.id, Number(id)));
  } catch (error: unknown) {
    const newFilePath = `public${imageUrl}`; // recompute path
    if (await fileExists(newFilePath)) {
      await fs.unlink(newFilePath);
    }

    let errorMessage = "Something went wrong.";

    if (error instanceof Error) {
      const err = error as DbError;
      // Unique constraint violation and clean up the uploaded image
      if (err.cause?.code === "23505") {
        errorMessage = `A subcategory with this name already exists. Try a different name!`;
      } else if (err.message) {
        errorMessage = err.message;
      }
    }

    return {
      success: false,
      errors: {
        name: [errorMessage],
      },
    };
  }

  revalidatePath("/");
  revalidatePath("/subcategories");
  redirect("/admin/subcategories");
}

// This function handles the editing of an existing category
export async function ToggleSubcategoryActive(id: number, active: boolean) {
  await db
    .update(subcategories)
    .set({ isActive: active })
    .where(eq(subcategories.id, Number(id)));

  revalidatePath("/");
  revalidatePath("/subcategories");
}

// This function handles the deletion of a subcategory
export async function deleteSubcategory(id: number): Promise<string> {
  const [subcategory] = await db
    .delete(subcategories)
    .where(eq(subcategories.id, Number(id)))
    .returning();

  if (!subcategory) notFound();

  const imageUrl = subcategory?.imageUrl ?? "";

  const fullFilePath = `public${imageUrl}`;

  // Delete the image file from the server
  if (await fileExists(fullFilePath)) {
    await fs.unlink(fullFilePath);
  }

  revalidatePath("/");
  revalidatePath("/subcategories");
  return `Subcategory ${subcategory.name} was successfully deleted.`;
}
