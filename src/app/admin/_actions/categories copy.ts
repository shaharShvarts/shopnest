"use server";

import z from "zod";
import fs from "fs/promises";
import { notFound, redirect } from "next/navigation";
import { db } from "@/drizzle/db";
import { categories } from "@/drizzle/schema";
import { imageSchema } from "./zod";
import { eq } from "drizzle-orm/sql";
import { revalidatePath } from "next/cache";

const zodSchema = z.object({
  name: z.string().min(1, "Name is required"),
  image: imageSchema.refine((file) => file.size > 0, {
    message: "Image must not be empty",
  }),
});

const editSchema = zodSchema.extend({
  image: imageSchema.optional(),
});

// export type FormDataState = {
//   success: boolean;
//   fields?: Record<string, string>;
//   errors?: Record<string, string[]>;
// };

// This function handles the addition of a new category
export async function addCategory(
  _: any,
  formData: FormData
): Promise<FormDataState> {
  const data = Object.fromEntries(formData);
  const result = zodSchema.safeParse(data);

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

  const { name, image } = result.data;

  await fs.mkdir("public/categories", { recursive: true });
  const imageUrl = `/categories/${crypto.randomUUID()}-${image.name}`;
  await fs.writeFile(
    `public${imageUrl}`,
    Buffer.from(await image.arrayBuffer())
  );

  // Save category data to the database
  const queryResult = await db
    .insert(categories)
    .values({ name, imageUrl })
    .onConflictDoNothing({ target: [categories.name] })
    .returning();

  if (queryResult.length === 0) {
    // No row was inserted — name already exists
    return {
      success: false,
      fields: {
        name,
        image: image.name,
      },
      errors: {
        name: [
          `A category with this name (${name}) already exists. Try a different name!`,
        ],
      },
    };
  }

  // Redirect to the categories page after successful addition
  revalidatePath("/");
  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

// This function handles the editing of an existing category
export async function editCategory(
  id: number,
  prevState: FormDataState,
  formData: FormData
): Promise<FormDataState> {
  const data = Object.fromEntries(formData);
  const result = editSchema.safeParse(data);

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

  const { name, image } = result.data;

  // Fetch the existing category from the database
  const category = await db
    .select()
    .from(categories)
    .where(eq(categories.id, Number(id)))
    .limit(1);

  if (!category) notFound();

  let imageUrl = category[0].imageUrl;
  if (image != null && image.size > 0) {
    await fs.unlink(`public${category[0].imageUrl}`);
    imageUrl = `/categories/${crypto.randomUUID()}-${image.name}`;
    await fs.writeFile(
      `public${imageUrl}`,
      Buffer.from(await image.arrayBuffer())
    );
  }

  // Update category data to the database
  await db
    .update(categories)
    .set({
      name,
      imageUrl: imageUrl,
    })
    .where(eq(categories.id, Number(id)));

  // Redirect to the categories page after successful addition
  revalidatePath("/");
  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

// This function handles the editing of an existing category
export async function ToggleCategoryActive(id: number, active: boolean) {
  // Update the category's active status in the database
  await db
    .update(categories)
    .set({ isActive: active })
    .where(eq(categories.id, Number(id)));

  // Redirect to the categories page after successful update
  revalidatePath("/");
  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}

// This function handles the deletion of a category
export async function deleteCategory(id: number) {
  const [category] = await db
    .delete(categories)
    .where(eq(categories.id, Number(id)))
    .returning();

  if (!category) notFound();

  // Delete the image file from the server
  await fs.unlink(`public/${category.imageUrl}`);

  revalidatePath("/");
  revalidatePath("/admin/categories");
  redirect("/admin/categories");
}
