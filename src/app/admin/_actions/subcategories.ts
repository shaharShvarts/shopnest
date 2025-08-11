"use server";

import z from "zod";
import fs from "fs/promises";
import { eq } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { imageSchema } from "./zod";
import { revalidatePath } from "next/cache";
import { subcategories } from "@/drizzle/schema";
import { notFound, redirect } from "next/navigation";

//   image: z.instanceof(File).optional(),
const zodSchema = z.object({
  name: z.string().min(1, "Name is required"),
  image: imageSchema,
  categoryId: z.coerce.number().int().positive("Category ID is required"),
});

const editSchema = zodSchema.extend({
  image: z.instanceof(File).optional(),
});

// This function handles the addition of a new category
export async function addSubcategory(_: any, formData: FormData) {
  const result = zodSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  let imageUrl = "";
  const { name, image, categoryId } = result.data;

  await fs.mkdir("public/subcategories", { recursive: true });
  imageUrl = `/subcategories/${crypto.randomUUID()}-${image.name}`;
  await fs.writeFile(
    `public${imageUrl}`,
    Buffer.from(await image.arrayBuffer())
  );

  // Save category data to the database
  try {
    await db.insert(subcategories).values({ name, imageUrl, categoryId });
  } catch (error: unknown) {
    await fs.unlink(`public${imageUrl}`);
    let errorMessage = "Something went wrong.";

    if (error instanceof Error) {
      const err = error as any;
      // Unique constraint violation and clean up the uploaded image
      if (err.cause.code === "23505") {
        errorMessage = `A subcategory with this name (${name}) already exists. Try a different name!`;
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
  redirect("/admin/subcategories");
}

// // This function handles the editing of an existing category
export async function editSubcategory(id: number, _: any, formData: FormData) {
  const result = editSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  const { name, image, categoryId } = result.data;

  // Fetch the existing category from the database
  const [subcategory] = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.id, Number(id)))
    .limit(1);

  if (!subcategory) notFound();

  let imageUrl = subcategory.imageUrl;
  if (image != null && image.size > 0) {
    await fs.unlink(`public${imageUrl}`);
    imageUrl = `/subcategories/${crypto.randomUUID()}-${image.name}`;
    await fs.writeFile(
      `public${imageUrl}`,
      Buffer.from(await image.arrayBuffer())
    );
  }

  // Update subcategory data to the database
  try {
    await db
      .update(subcategories)
      .set({
        name,
        categoryId,
        imageUrl: imageUrl,
      })
      .where(eq(subcategories.id, Number(id)));
  } catch (error: unknown) {
    let errorMessage = "Something went wrong.";

    if (error instanceof Error) {
      const err = error as any;
      // Unique constraint violation and clean up the uploaded image
      if (err.cause.code === "23505") {
        errorMessage = `A category with this name (${name}) already exists. Try a different name!`;
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
  redirect("/admin/subcategories");
}

// This function handles the editing of an existing category
export async function ToggleSubcategoryActive(id: number, active: boolean) {
  // Update the category's active status in the database
  await db
    .update(subcategories)
    .set({ isActive: active })
    .where(eq(subcategories.id, Number(id)));

  // Redirect to the categories page after successful update
  revalidatePath("/");
  revalidatePath("/admin/subcategories");
  redirect("/admin/subcategories");
}

// This function handles the deletion of a subcategory
export async function deleteSubcategory(id: number): Promise<string> {
  const [subcategory] = await db
    .delete(subcategories)
    .where(eq(subcategories.id, Number(id)))
    .returning();

  // Delete the image file from the server
  await fs.unlink(`public/${subcategory.imageUrl}`);
  revalidatePath("/admin/subcategories");
  return `Subcategory ${subcategory.name} was successfully deleted.`;
}
