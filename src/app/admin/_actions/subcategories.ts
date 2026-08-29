"use server";

import z from "zod";
import fs from "fs/promises";
import { eq } from "drizzle-orm";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { imageSchema, optionalImageSchema } from "./zod";
import {
  revalidateTenantPath,
  tenantPath,
} from "@/lib/tenant-context";
import { fileExists } from "@/lib/fileExists";
import { subcategories } from "@/drizzle/schema";
import { notFound, redirect } from "next/navigation";
import { DrizzleCatalogStore } from "@/lib/drizzle-catalog-store";
import {
  createCatalogSubcategory,
  validateCategory,
} from "@/lib/catalog/core";
import { catalogFormError, isForeignKeyViolation } from "@/lib/catalog/errors";

const zodSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  image: imageSchema,
  categoryId: z.coerce.number().int().positive("Category ID is required"),
});

const editSchema = zodSchema.extend({
  image: optionalImageSchema,
});

// This function handles the addition of a new category
export async function addSubcategory(_: unknown, formData: FormData) {
  const { db } = await requireTenantAdminDb();
  const store = new DrizzleCatalogStore(db);
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
    await createCatalogSubcategory(store, { ...rawData, imageUrl });
  } catch (error: unknown) {
    if (await fileExists(fullFilePath)) {
      await fs.unlink(fullFilePath);
    }

    const formError = catalogFormError(error, "subcategory");

    return {
      success: false,
      errors: {
        [formError.field]: [formError.message],
      },
    };
  }

  await revalidateTenantPath("/");
  await revalidateTenantPath("/subcategories");
  await revalidateTenantPath(`/categories/${rawData.categoryId}/products`);
  redirect(await tenantPath("/admin/subcategories"));
}

// // This function handles the editing of an existing category
export async function editSubcategory(
  id: number,
  _: unknown,
  formData: FormData
) {
  const { db } = await requireTenantAdminDb();
  const store = new DrizzleCatalogStore(db);
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

  if (!subcategory) notFound();

  try {
    await validateCategory(store, rawData.categoryId);
  } catch (error) {
    const formError = catalogFormError(error, "subcategory");
    return {
      success: false,
      errors: { [formError.field]: [formError.message] },
    };
  }

  const oldCategoryId = subcategory.categoryId;
  const oldImagePath = `public${subcategory.imageUrl}`;
  let imageUrl = subcategory.imageUrl;
  let newImagePath: string | null = null;

  if (image) {
    await fs.mkdir("public/subcategories", { recursive: true });
    imageUrl = `/subcategories/${crypto.randomUUID()}-${image.name}`;
    newImagePath = `public${imageUrl}`;
    await fs.writeFile(newImagePath, Buffer.from(await image.arrayBuffer()));
  }

  // Update subcategory data to the database
  try {
    await db
      .update(subcategories)
      .set({ ...rawData, imageUrl })
      .where(eq(subcategories.id, Number(id)));
  } catch (error: unknown) {
    if (newImagePath && (await fileExists(newImagePath))) {
      await fs.unlink(newImagePath);
    }
    const formError = catalogFormError(error, "subcategory");

    return {
      success: false,
      errors: {
        [formError.field]: [formError.message],
      },
    };
  }

  if (newImagePath && (await fileExists(oldImagePath))) {
    await fs.unlink(oldImagePath);
  }

  await revalidateTenantPath("/");
  await revalidateTenantPath("/subcategories");
  await revalidateTenantPath(`/categories/${oldCategoryId}/products`);
  if (rawData.categoryId !== oldCategoryId) {
    await revalidateTenantPath(`/categories/${rawData.categoryId}/products`);
  }
  redirect(await tenantPath("/admin/subcategories"));
}

// This function handles the editing of an existing category
export async function ToggleSubcategoryActive(id: number, active: boolean) {
  const { db } = await requireTenantAdminDb();
  const [updated] = await db
    .update(subcategories)
    .set({ isActive: active })
    .where(eq(subcategories.id, Number(id)))
    .returning({ categoryId: subcategories.categoryId });

  if (!updated) notFound();

  await revalidateTenantPath("/");
  await revalidateTenantPath("/subcategories");
  await revalidateTenantPath(`/categories/${updated.categoryId}/products`);
}

// This function handles the deletion of a subcategory
export async function deleteSubcategory(id: number): Promise<string> {
  const { db } = await requireTenantAdminDb();
  let subcategory;
  try {
    [subcategory] = await db
      .delete(subcategories)
      .where(eq(subcategories.id, Number(id)))
      .returning();
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return "Subcategory cannot be deleted while it has products.";
    }
    throw error;
  }

  if (!subcategory) notFound();

  const imageUrl = subcategory?.imageUrl ?? "";

  const fullFilePath = `public${imageUrl}`;

  // Delete the image file from the server
  if (await fileExists(fullFilePath)) {
    await fs.unlink(fullFilePath);
  }

  await revalidateTenantPath("/");
  await revalidateTenantPath("/subcategories");
  await revalidateTenantPath(`/categories/${subcategory.categoryId}/products`);
  return `Subcategory ${subcategory.name} was successfully deleted.`;
}
