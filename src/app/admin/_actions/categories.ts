"use server";

import z from "zod";
import { eq } from "drizzle-orm";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { imageSchema, optionalImageSchema } from "./zod";
import { revalidateTenantPath } from "@/lib/tenant-context";
import { categories } from "@/drizzle/schema";
import { notFound } from "next/navigation";
import { DrizzleCatalogStore } from "@/lib/drizzle-catalog-store";
import { createCatalogCategory } from "@/lib/catalog/core";
import { catalogFormError, isForeignKeyViolation } from "@/lib/catalog/errors";
import {
  deleteCatalogImage,
  saveCatalogImage,
} from "@/lib/media/catalog-media";

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
  const { db, tenant } = await requireTenantAdminDb();
  const result = zodSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  const { image, ...rawData } = result.data;

  const uploadedImage = await saveCatalogImage({
    tenantSlug: tenant.slug,
    kind: "categories",
    file: image,
  });

  try {
    await createCatalogCategory(new DrizzleCatalogStore(db), {
      ...rawData,
      imageUrl: uploadedImage.imageUrl,
    });
  } catch (error) {
    await deleteCatalogImage({
      tenantSlug: tenant.slug,
      imageUrl: uploadedImage.imageUrl,
    });

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
  const { db, tenant } = await requireTenantAdminDb();
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

  let imageUrl = category.imageUrl;
  let uploadedImage: Awaited<ReturnType<typeof saveCatalogImage>> | null = null;

  if (image) {
    uploadedImage = await saveCatalogImage({
      tenantSlug: tenant.slug,
      kind: "categories",
      file: image,
    });
    imageUrl = uploadedImage.imageUrl;
  }

  try {
    await db
      .update(categories)
      .set({ ...rawData, imageUrl })
      .where(eq(categories.id, Number(id)));
  } catch (error) {
    if (uploadedImage) {
      await deleteCatalogImage({
        tenantSlug: tenant.slug,
        imageUrl: uploadedImage.imageUrl,
      });
    }
    const formError = catalogFormError(error, "category");

    return {
      success: false,
      errors: {
        [formError.field]: [formError.message],
      },
    };
  }

  if (uploadedImage) {
    await deleteCatalogImage({
      tenantSlug: tenant.slug,
      imageUrl: category.imageUrl,
    });
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
  const { db, tenant } = await requireTenantAdminDb();
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

  await deleteCatalogImage({
    tenantSlug: tenant.slug,
    imageUrl: category.imageUrl,
  });

  await revalidateTenantPath("/");
  await revalidateTenantPath("/categories");
  await revalidateTenantPath(`/categories/${id}/products`);
  return `Category ${category.name} was successfully deleted.`;
}
