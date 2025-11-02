"use server";

import z from "zod";
import fs from "fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { imageSchema } from "./zod";
import { revalidatePath } from "next/cache";
import { fileExists } from "@/lib/fileExists";
import { categories } from "@/drizzle/schema";
import { notFound } from "next/navigation";

const zodSchema = z.object({
  name: z.string().min(1, "Name is required"),
  image: imageSchema,
});

const editSchema = zodSchema.extend({
  image: z.instanceof(File).optional(),
});

type CategoryFormErrors = {
  name?: string[];
  image?: string[];
};

type AddCategoryResult = {
  success: boolean;
  errors?: CategoryFormErrors;
  message?: string;
};

type DbError = Error & {
  cause?: {
    code?: string;
  };
};

export async function addCategory(
  _: unknown,
  formData: FormData
): Promise<AddCategoryResult> {
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

  try {
    await db.insert(categories).values({ ...rawData, imageUrl });
  } catch (error) {
    if (await fileExists(fullFilePath)) {
      await fs.unlink(fullFilePath);
    }

    let errorMessage = "Something went wrong.";

    const err = error as DbError;

    if (err.cause?.code === "23505") {
      errorMessage =
        "A category with this name already exists. Try a different name!";
    } else if (err.message) {
      errorMessage = err.message;
    }

    return {
      success: false,
      errors: {
        name: [errorMessage],
      },
    };
  }

  revalidatePath("/");
  revalidatePath("/categories");

  return {
    success: true,
    errors: {},
    message: "Category added successfully",
  };
}

export async function editCategory(id: number, _: unknown, formData: FormData) {
  const result = editSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  const { image, ...rawData } = result.data;

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
    const newFilePath = `public${imageUrl}`;
    await fs.writeFile(newFilePath, Buffer.from(await image.arrayBuffer()));
  }

  try {
    await db
      .update(categories)
      .set({ ...rawData, imageUrl })
      .where(eq(categories.id, Number(id)));
  } catch (error) {
    const newFilePath = `public${imageUrl}`;
    if (await fileExists(newFilePath)) {
      await fs.unlink(newFilePath);
    }

    let errorMessage = "Something went wrong.";

    const err = error as DbError;

    if (err.cause?.code === "23505") {
      errorMessage =
        "A category with this name already exists. Try a different name!";
    } else if (err.message) {
      errorMessage = err.message;
    }

    return {
      success: false,
      errors: {
        name: [errorMessage],
      },
    };
  }

  revalidatePath("/");
  revalidatePath("/categories");

  return {
    success: true,
    errors: {},
    message: "Category updated successfully",
  };
}

export async function ToggleCategoryActive(id: number, active: boolean) {
  await db
    .update(categories)
    .set({ isActive: active })
    .where(eq(categories.id, Number(id)));

  // Redirect to the categories page after successful update
  revalidatePath("/");
  revalidatePath("/categories");
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

  revalidatePath("/");
  revalidatePath("/categories");
  return `Category ${category.name} was successfully deleted.`;
}
