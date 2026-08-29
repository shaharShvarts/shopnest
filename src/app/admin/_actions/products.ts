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
import { validateProductPlacement } from "@/lib/catalog/core";
import { catalogFormError, isForeignKeyViolation } from "@/lib/catalog/errors";
import {
  deleteCatalogImage,
  saveCatalogImage,
} from "@/lib/media/catalog-media";
import {
  adjustInventoryInTransaction,
  initializeInventoryAlertsInTransaction,
  InventoryError,
} from "@/lib/inventory/core";
import { DrizzleInventoryTransaction } from "@/lib/inventory/drizzle-store";
import { DatabaseOnlyInventoryNotificationService } from "@/lib/inventory/notifications";

const productFields = {
  name: z.string().trim().min(1, "Name is required"),
  price: z.coerce
    .number()
    .int("Price must be a whole number")
    .min(0, "Price must be a non-negative number"),
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .min(0, "Quantity must be a non-negative number"),
  lowStockThreshold: z.coerce
    .number()
    .int("Low-stock threshold must be a whole number")
    .min(0, "Low-stock threshold must be non-negative")
    .default(10),
  criticalStockThreshold: z.coerce
    .number()
    .int("Critical-stock threshold must be a whole number")
    .min(0, "Critical-stock threshold must be non-negative")
    .default(4),
  description: z.string().trim().optional(),
  categoryId: z.coerce.number().int().positive("Category is required"),
  subcategoryId: z.preprocess((val) => {
    if (val === "" || val === "0" || val === undefined || val === null) {
      return null;
    }
    return Number(val);
  }, z.number().int().positive("Invalid subcategory").nullable()),
};

function validateThresholdOrder(
  data: { lowStockThreshold: number; criticalStockThreshold: number },
  context: z.RefinementCtx
) {
  if (data.criticalStockThreshold > data.lowStockThreshold) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["criticalStockThreshold"],
      message: "Critical-stock threshold cannot exceed low-stock threshold",
    });
  }
}

const productSchema = z
  .object({ ...productFields, image: imageSchema })
  .superRefine(validateThresholdOrder);

const editSchema = z
  .object({ ...productFields, image: optionalImageSchema })
  .superRefine(validateThresholdOrder);

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

  const uploadedImage = await saveCatalogImage({
    tenantSlug: tenant.slug,
    kind: "products",
    file: image,
  });

  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(products)
        .values({ ...rawData, imageUrl: uploadedImage.imageUrl })
        .returning({ id: products.id });
      await initializeInventoryAlertsInTransaction(
        new DrizzleInventoryTransaction(tx),
        created.id,
        new Date(),
        new DatabaseOnlyInventoryNotificationService()
      );
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
    await db.transaction(async (tx) => {
      await adjustInventoryInTransaction(
        new DrizzleInventoryTransaction(tx),
        id,
        {
          physical: rawData.quantity,
          lowStockThreshold: rawData.lowStockThreshold,
          criticalStockThreshold: rawData.criticalStockThreshold,
        },
        new DatabaseOnlyInventoryNotificationService()
      );
      await tx
        .update(products)
        .set({
          name: rawData.name,
          description: rawData.description,
          price: rawData.price,
          categoryId: rawData.categoryId,
          subcategoryId: rawData.subcategoryId,
          imageUrl,
        })
        .where(eq(products.id, id));
    });
  } catch (error: unknown) {
    if (uploadedImage) {
      await deleteCatalogImage({
        tenantSlug: tenant.slug,
        imageUrl: uploadedImage.imageUrl,
      });
    }
    if (error instanceof InventoryError) {
      const field =
        error.code === "invalid_thresholds"
          ? "criticalStockThreshold"
          : "quantity";
      return {
        success: false,
        errors: { [field]: [error.message] },
      };
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
