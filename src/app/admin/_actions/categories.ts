"use server";

import z from "zod";
import fs from "fs/promises";
import { eq } from "drizzle-orm";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { imageSchema, optionalImageSchema } from "./zod";
import { revalidateTenantPath } from "@/lib/tenant-context";
import { fileExists } from "@/lib/fileExists";
import { categories } from "@/drizzle/schema";
import { notFound } from "next/navigation";
import { DrizzleCatalogStore } from "@/lib/drizzle-catalog-store";
import { createCatalogCategory } from "@/lib/catalog/core";
import { catalogFormError, isForeignKeyViolation } from "@/lib/catalog/errors";
import { normalizeImageUrl } from "@/lib/images/image-url.mjs";
import { publicImageFilePath } from "@/lib/images/image-files";

const zodSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  image: imageSchema,
});

const editSchema = zodSchema.extend({
  image: optionalImageSchema,
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

export async function addCategory(
  _: unknown,
  formData: FormData
): Promise<AddCategoryResult> {
  const { db } = await requireTenantAdminDb();
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
  const fullFilePath = publicImageFilePath(imageUrl)!;
  await fs.writeFile(fullFilePath, Buffer.from(await image.arrayBuffer()));

  try {
    await createCatalogCategory(new DrizzleCatalogStore(db), {
      ...rawData,
      imageUrl,
    });
  } catch (error) {
    if (await fileExists(fullFilePath)) {
      await fs.unlink(fullFilePath);
    }

    const formError = catalogFormError(error, "category");

    return {
      success: false,
      errors: {
        [formError.field]: [formError.message],
      },
    };
  }

  await revalidateTenantPath("/");
  await revalidateTenantPath("/categories");

  return {
    success: true,
    errors: {},
    message: "Category added successfully",
  };
}

export async function editCategory(id: number, _: unknown, formData: FormData) {
  const { db } = await requireTenantAdminDb();
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

  if (!category) notFound();

  const oldImagePath = publicImageFilePath(category.imageUrl);
  let imageUrl = normalizeImageUrl(category.imageUrl) ?? category.imageUrl;
  let newImagePath: string | null = null;

  if (image) {
    await fs.mkdir("public/categories", { recursive: true });
    imageUrl = `/categories/${crypto.randomUUID()}-${image.name}`;
    newImagePath = publicImageFilePath(imageUrl)!;
    await fs.writeFile(newImagePath, Buffer.from(await image.arrayBuffer()));
  }

  try {
    await db
      .update(categories)
      .set({ ...rawData, imageUrl })
      .where(eq(categories.id, Number(id)));
  } catch (error) {
    if (newImagePath && (await fileExists(newImagePath))) {
      await fs.unlink(newImagePath);
    }
    const formError = catalogFormError(error, "category");

    return {
      success: false,
      errors: {
        [formError.field]: [formError.message],
      },
    };
  }

  if (newImagePath && oldImagePath && (await fileExists(oldImagePath))) {
    await fs.unlink(oldImagePath);
  }

  await revalidateTenantPath("/");
  await revalidateTenantPath("/categories");
  await revalidateTenantPath(`/categories/${id}/products`);

  return {
    success: true,
    errors: {},
    message: "Category updated successfully",
  };
}

export async function ToggleCategoryActive(id: number, active: boolean) {
  const { db } = await requireTenantAdminDb();
  const updated = await db
    .update(categories)
    .set({ isActive: active })
    .where(eq(categories.id, Number(id)))
    .returning({ id: categories.id });

  if (updated.length === 0) notFound();

  // Redirect to the categories page after successful update
  await revalidateTenantPath("/");
  await revalidateTenantPath("/categories");
  await revalidateTenantPath(`/categories/${id}/products`);
}

// This function handles the deletion of a category
export async function deleteCategory(id: number): Promise<string> {
  const { db } = await requireTenantAdminDb();
  let category;
  try {
    [category] = await db
      .delete(categories)
      .where(eq(categories.id, Number(id)))
      .returning();
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return "Category cannot be deleted while it has products or subcategories.";
    }
    throw error;
  }

  if (!category) notFound();

  const fullFilePath = publicImageFilePath(category.imageUrl);

  // Delete the image file from the server
  if (fullFilePath && (await fileExists(fullFilePath))) {
    await fs.unlink(fullFilePath);
  }

  await revalidateTenantPath("/");
  await revalidateTenantPath("/categories");
  await revalidateTenantPath(`/categories/${id}/products`);
  return `Category ${category.name} was successfully deleted.`;
}
