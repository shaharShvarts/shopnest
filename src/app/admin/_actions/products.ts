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
import { products } from "@/drizzle/schema";
import { fileExists } from "@/lib/fileExists";
import { notFound, redirect } from "next/navigation";
import { DrizzleCatalogStore } from "@/lib/drizzle-catalog-store";
import {
  createCatalogProduct,
  validateProductPlacement,
} from "@/lib/catalog/core";
import { catalogFormError, isForeignKeyViolation } from "@/lib/catalog/errors";

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
  const { db } = await requireTenantAdminDb();
  const store = new DrizzleCatalogStore(db);
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
    await createCatalogProduct(store, { ...rawData, imageUrl });
  } catch (error: unknown) {
    if (await fileExists(fullFilePath)) {
      await fs.unlink(fullFilePath);
    }

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
  const oldImagePath = `public${productRow.imageUrl}`;
  let imageUrl = productRow.imageUrl;
  let newImagePath: string | null = null;

  if (image) {
    await fs.mkdir("public/products", { recursive: true });
    imageUrl = `/products/${crypto.randomUUID()}-${image.name}`;
    newImagePath = `public${imageUrl}`;
    await fs.writeFile(newImagePath, Buffer.from(await image.arrayBuffer()));
  }

  try {
    await db
      .update(products)
      .set({ ...rawData, imageUrl })
      .where(eq(products.id, id));
  } catch (error: unknown) {
    if (newImagePath && (await fileExists(newImagePath))) {
      await fs.unlink(newImagePath);
    }
    const formError = catalogFormError(error, "product");

    return {
      success: false,
      errors: { [formError.field]: [formError.message] },
    };
  }

  if (newImagePath && (await fileExists(oldImagePath))) {
    await fs.unlink(oldImagePath);
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
  const { db } = await requireTenantAdminDb();
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

  const imageUrl = productRow?.imageUrl ?? "";

  const fullFilePath = `public${imageUrl}`;

  if (await fileExists(fullFilePath)) {
    await fs.unlink(fullFilePath);
  }

  await revalidateTenantPath("/");
  await revalidateTenantPath("/products");
  await revalidateTenantPath(`/categories/${productRow.categoryId}/products`);
  return `product ${productRow.name} was successfully deleted.`;
}
