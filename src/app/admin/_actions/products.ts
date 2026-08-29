"use server";

import z from "zod";
import { eq } from "drizzle-orm";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { imageSchema, optionalImageSchema } from "./zod";
import {
  revalidateTenantPath,
  tenantPath,
} from "@/lib/tenant-context";
import { products } from "@/drizzle/schema";
import { notFound, redirect } from "next/navigation";
import { DrizzleCatalogStore } from "@/lib/drizzle-catalog-store";
import {
  createCatalogProduct,
  validateProductPlacement,
} from "@/lib/catalog/core";
import { catalogFormError, isForeignKeyViolation } from "@/lib/catalog/errors";
import {
  deleteCatalogImage,
  saveCatalogImage,
} from "@/lib/media/catalog-media";

const productSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  price: z.coerce
    .number()
    .int("Price must be a whole number")
    .min(0, "Price must be a non-negative number"),
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .positive("Quantity must be greater than zero"),
  description: z.string().trim().optional(),
  image: imageSchema,
  categoryId: z.coerce.number().int().positive("Category is required"),
  subcategoryId: z.preprocess((val) => {
    if (val === "" || val === "0" || val === undefined || val === null) {
      return null;
    }
    return Number(val);
  }, z.number().int().positive("Invalid subcategory").nullable()),
});

const editSchema = productSchema.extend({
  image: optionalImageSchema,
});

export async function addProduct(_: unknown, formData: FormData) {
  const { db, tenant } = await requireTenantAdminDb();
  const store = new DrizzleCatalogStore(db);
  const result = productSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  const { image, ...rawData } = result.data;

  const uploadedImage = await saveCatalogImage({
    tenantSlug: tenant.slug,
    kind: "products",
    file: image,
  });

  try {
    await createCatalogProduct(store, {
      ...rawData,
      imageUrl: uploadedImage.imageUrl,
    });
  } catch (error: unknown) {
    await deleteCatalogImage({
      tenantSlug: tenant.slug,
      imageUrl: uploadedImage.imageUrl,
    });

    const formError = catalogFormError(error, "product");

    return {
      success: false,
      errors: { [formError.field]: [formError.message] },
    };
  }

  await revalidateTenantPath("/");
  await revalidateTenantPath("/products");
  await revalidateTenantPath(`/categories/${rawData.categoryId}/products`);
  redirect(await tenantPath("/admin/products"));
}

export async function editProduct(id: number, _: unknown, formData: FormData) {
  const { db, tenant } = await requireTenantAdminDb();
  const store = new DrizzleCatalogStore(db);
  const result = editSchema.safeParse(Object.fromEntries(formData));

  if (!result.success) {
    return {
      success: false,
      errors: result.error.flatten().fieldErrors,
    };
  }

  const { image, ...rawData } = result.data;

  const [productRow] = await db
    .select({ imageUrl: products.imageUrl, categoryId: products.categoryId })
    .from(products)
    .where(eq(products.id, Number(id)))
    .limit(1);

  if (!productRow) notFound();

  try {
    await validateProductPlacement(
      store,
      rawData.categoryId,
      rawData.subcategoryId
    );
  } catch (error) {
    const formError = catalogFormError(error, "product");
    return {
      success: false,
      errors: { [formError.field]: [formError.message] },
    };
  }

  const oldCategoryId = productRow.categoryId;
  let imageUrl = productRow.imageUrl;
  let uploadedImage: Awaited<ReturnType<typeof saveCatalogImage>> | null = null;

  if (image) {
    uploadedImage = await saveCatalogImage({
      tenantSlug: tenant.slug,
      kind: "products",
      file: image,
    });
    imageUrl = uploadedImage.imageUrl;
  }

  try {
    await db
      .update(products)
      .set({ ...rawData, imageUrl })
      .where(eq(products.id, id));
  } catch (error: unknown) {
    if (uploadedImage) {
      await deleteCatalogImage({
        tenantSlug: tenant.slug,
        imageUrl: uploadedImage.imageUrl,
      });
    }
    const formError = catalogFormError(error, "product");

    return {
      success: false,
      errors: { [formError.field]: [formError.message] },
    };
  }

  if (uploadedImage) {
    await deleteCatalogImage({
      tenantSlug: tenant.slug,
      imageUrl: productRow.imageUrl,
    });
  }

  await revalidateTenantPath("/");
  await revalidateTenantPath("/products");
  await revalidateTenantPath(`/categories/${oldCategoryId}/products`);
  if (rawData.categoryId !== oldCategoryId) {
    await revalidateTenantPath(`/categories/${rawData.categoryId}/products`);
  }
  redirect(await tenantPath("/admin/products"));
}

export async function ToggleProductActive(id: number, active: boolean) {
  const { db } = await requireTenantAdminDb();
  const [updated] = await db
    .update(products)
    .set({ isActive: active })
    .where(eq(products.id, Number(id)))
    .returning({ categoryId: products.categoryId });

  if (!updated) notFound();

  await revalidateTenantPath("/");
  await revalidateTenantPath("/products");
  await revalidateTenantPath(`/categories/${updated.categoryId}/products`);
}

export async function deleteProduct(id: number): Promise<string> {
  const { db, tenant } = await requireTenantAdminDb();
  let productRow;
  try {
    [productRow] = await db
      .delete(products)
      .where(eq(products.id, Number(id)))
      .returning();
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      return "Product cannot be deleted because it is referenced by an order.";
    }
    throw error;
  }

  if (!productRow) notFound();

  await deleteCatalogImage({
    tenantSlug: tenant.slug,
    imageUrl: productRow.imageUrl,
  });

  await revalidateTenantPath("/");
  await revalidateTenantPath("/products");
  await revalidateTenantPath(`/categories/${productRow.categoryId}/products`);
  return `product ${productRow.name} was successfully deleted.`;
}
