"use server";

import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import z from "zod";
import { categories, products, subcategories } from "@/drizzle/schema";
import { DrizzleCatalogStore } from "@/lib/drizzle-catalog-store";
import {
  createCatalogCategory,
  createCatalogSubcategory,
  validateCategory,
  validateProductPlacement,
} from "@/lib/catalog/core";
import { catalogFormError, isForeignKeyViolation } from "@/lib/catalog/errors";
import {
  deleteCatalogImage,
  saveCatalogImage,
} from "@/lib/media/catalog-media";
import {
  ImageValidationError,
  validateCatalogImage,
} from "@/lib/media/validate-image.mjs";
import {
  adjustInventoryInTransaction,
  initializeInventoryAlertsInTransaction,
  InventoryError,
} from "@/lib/inventory/core";
import { DrizzleInventoryTransaction } from "@/lib/inventory/drizzle-store";
import { DatabaseOnlyInventoryNotificationService } from "@/lib/inventory/notifications";
import { prefixTenantPath } from "@/lib/tenant";
import { requireStoreManagementDb } from "@/lib/store-management/server";

const imageSchema = z
  .custom<File>((file) => file instanceof File, {
    message: "Choose a valid, supported image.",
  })
  .superRefine(async (file, context) => {
    if (!(file instanceof File)) return;
    try {
      await validateCatalogImage(file);
    } catch (error) {
      if (!(error instanceof ImageValidationError)) throw error;
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: error.message,
      });
    }
  });

const optionalImageSchema = z.preprocess(
  (value) =>
    value instanceof File && value.size === 0 && value.name === ""
      ? undefined
      : value,
  imageSchema.optional()
);

const categoryCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  image: imageSchema,
});

const categoryEditSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  image: optionalImageSchema,
});

const subcategoryFields = {
  name: z.string().trim().min(1, "Name is required"),
  categoryId: z.coerce.number().int().positive("Category is required"),
};

const subcategoryCreateSchema = z.object({
  ...subcategoryFields,
  image: imageSchema,
});

const subcategoryEditSchema = z.object({
  ...subcategoryFields,
  image: optionalImageSchema,
});

const productFields = {
  name: z.string().trim().min(1, "Name is required"),
  price: z.coerce
    .number()
    .int("Price must be a whole number")
    .min(0, "Price must be non-negative"),
  quantity: z.coerce
    .number()
    .int("Quantity must be a whole number")
    .min(0, "Quantity must be non-negative"),
  lowStockThreshold: z.coerce
    .number()
    .int()
    .min(0, "Low-stock threshold must be non-negative")
    .default(10),
  criticalStockThreshold: z.coerce
    .number()
    .int()
    .min(0, "Critical-stock threshold must be non-negative")
    .default(4),
  description: z.string().trim().optional(),
  categoryId: z.coerce.number().int().positive("Category is required"),
  subcategoryId: z.preprocess(
    (value) =>
      value === "" || value === "0" || value === undefined || value === null
        ? null
        : Number(value),
    z.number().int().positive("Invalid subcategory").nullable()
  ),
};

function validateThresholds(
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

const productCreateSchema = z
  .object({ ...productFields, image: imageSchema })
  .superRefine(validateThresholds);

const productEditSchema = z
  .object({ ...productFields, image: optionalImageSchema })
  .superRefine(validateThresholds);


function trustedMediaResolver(tenant: {
  slug: string;
  schema: string;
  basePath: string;
}) {
  return (value: unknown) =>
    typeof value === "string" && value === tenant.slug ? tenant : null;
}

function managedPath(storeId: number, section: string) {
  return `/dashboard/stores/${storeId}/${section}`;
}

function revalidateManagedCatalog(
  storeId: number,
  tenant: { slug: string; basePath: string },
  paths: string[]
) {
  revalidatePath(managedPath(storeId, "products"));
  revalidatePath(managedPath(storeId, "categories"));
  revalidatePath(managedPath(storeId, "subcategories"));

  for (const path of paths) {
    revalidatePath(prefixTenantPath(path, tenant.basePath));
  }
}

export async function addManagedCategory(
  storeId: number,
  _state: unknown,
  formData: FormData
) {
  const { db, tenant } = await requireStoreManagementDb(
    storeId,
    "catalog.manage"
  );
  const resolveTenant = trustedMediaResolver(tenant);
  const parsed = await categoryCreateSchema.safeParseAsync(
    Object.fromEntries(formData)
  );
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const { image, ...data } = parsed.data;
  const uploaded = await saveCatalogImage({
    tenantSlug: tenant.slug,
    kind: "categories",
    file: image,
    resolveTenant,
  });

  try {
    await createCatalogCategory(new DrizzleCatalogStore(db), {
      ...data,
      imageUrl: uploaded.imageUrl,
      resolveTenant,
    });
  } catch (error) {
    await deleteCatalogImage({
      tenantSlug: tenant.slug,
      imageUrl: uploaded.imageUrl,
      resolveTenant,
    });
    const formError = catalogFormError(error, "category");
    return {
      success: false,
      errors: { [formError.field]: [formError.message] },
    };
  }

  revalidateManagedCatalog(storeId, tenant, ["/", "/categories"]);
  redirect(managedPath(storeId, "categories"));
}

export async function editManagedCategory(
  storeId: number,
  categoryId: number,
  _state: unknown,
  formData: FormData
) {
  const { db, tenant } = await requireStoreManagementDb(
    storeId,
    "catalog.manage"
  );
  const resolveTenant = trustedMediaResolver(tenant);
  const parsed = await categoryEditSchema.safeParseAsync(
    Object.fromEntries(formData)
  );
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (!category) notFound();

  const { image, ...data } = parsed.data;
  let imageUrl = category.imageUrl;
  let uploaded: Awaited<ReturnType<typeof saveCatalogImage>> | null = null;

  if (image) {
    uploaded = await saveCatalogImage({
      tenantSlug: tenant.slug,
      kind: "categories",
      file: image,
    });
    imageUrl = uploaded.imageUrl;
  }

  try {
    await db
      .update(categories)
      .set({ ...data, imageUrl })
      .where(eq(categories.id, categoryId));
  } catch (error) {
    if (uploaded) {
      await deleteCatalogImage({
        tenantSlug: tenant.slug,
        imageUrl: uploaded.imageUrl,
        resolveTenant,
      });
    }
    const formError = catalogFormError(error, "category");
    return {
      success: false,
      errors: { [formError.field]: [formError.message] },
    };
  }

  if (uploaded) {
    await deleteCatalogImage({
      tenantSlug: tenant.slug,
      imageUrl: category.imageUrl,
      resolveTenant,
    });
  }

  revalidateManagedCatalog(storeId, tenant, [
    "/",
    "/categories",
    `/categories/${categoryId}/products`,
  ]);
  redirect(managedPath(storeId, "categories"));
}

export async function deleteManagedCategory(
  storeId: number,
  categoryId: number
): Promise<void> {
  const { db, tenant } = await requireStoreManagementDb(
    storeId,
    "catalog.manage"
  );
  const resolveTenant = trustedMediaResolver(tenant);

  let category;
  try {
    [category] = await db
      .delete(categories)
      .where(eq(categories.id, categoryId))
      .returning();
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new Error(
        "Category cannot be deleted while it has products or subcategories."
      );
    }
    throw error;
  }

  if (!category) notFound();
  await deleteCatalogImage({
    tenantSlug: tenant.slug,
    imageUrl: category.imageUrl,
    resolveTenant,
  });
  revalidateManagedCatalog(storeId, tenant, [
    "/",
    "/categories",
    `/categories/${categoryId}/products`,
  ]);
}

export async function addManagedSubcategory(
  storeId: number,
  _state: unknown,
  formData: FormData
) {
  const { db, tenant } = await requireStoreManagementDb(
    storeId,
    "catalog.manage"
  );
  const resolveTenant = trustedMediaResolver(tenant);
  const parsed = await subcategoryCreateSchema.safeParseAsync(
    Object.fromEntries(formData)
  );
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const { image, ...data } = parsed.data;
  const uploaded = await saveCatalogImage({
    tenantSlug: tenant.slug,
    kind: "subcategories",
    file: image,
    resolveTenant,
  });

  try {
    await createCatalogSubcategory(new DrizzleCatalogStore(db), {
      ...data,
      imageUrl: uploaded.imageUrl,
      resolveTenant,
    });
  } catch (error) {
    await deleteCatalogImage({
      tenantSlug: tenant.slug,
      imageUrl: uploaded.imageUrl,
      resolveTenant,
    });
    const formError = catalogFormError(error, "subcategory");
    return {
      success: false,
      errors: { [formError.field]: [formError.message] },
    };
  }

  revalidateManagedCatalog(storeId, tenant, [
    "/",
    "/subcategories",
    `/categories/${data.categoryId}/products`,
  ]);
  redirect(managedPath(storeId, "subcategories"));
}

export async function editManagedSubcategory(
  storeId: number,
  subcategoryId: number,
  _state: unknown,
  formData: FormData
) {
  const { db, tenant } = await requireStoreManagementDb(
    storeId,
    "catalog.manage"
  );
  const resolveTenant = trustedMediaResolver(tenant);
  const parsed = await subcategoryEditSchema.safeParseAsync(
    Object.fromEntries(formData)
  );
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const [subcategory] = await db
    .select()
    .from(subcategories)
    .where(eq(subcategories.id, subcategoryId))
    .limit(1);
  if (!subcategory) notFound();

  const store = new DrizzleCatalogStore(db);
  try {
    await validateCategory(store, parsed.data.categoryId);
  } catch (error) {
    const formError = catalogFormError(error, "subcategory");
    return {
      success: false,
      errors: { [formError.field]: [formError.message] },
    };
  }

  const { image, ...data } = parsed.data;
  let imageUrl = subcategory.imageUrl;
  let uploaded: Awaited<ReturnType<typeof saveCatalogImage>> | null = null;

  if (image) {
    uploaded = await saveCatalogImage({
      tenantSlug: tenant.slug,
      kind: "subcategories",
      file: image,
    });
    imageUrl = uploaded.imageUrl;
  }

  try {
    await db
      .update(subcategories)
      .set({ ...data, imageUrl })
      .where(eq(subcategories.id, subcategoryId));
  } catch (error) {
    if (uploaded) {
      await deleteCatalogImage({
        tenantSlug: tenant.slug,
        imageUrl: uploaded.imageUrl,
        resolveTenant,
      });
    }
    const formError = catalogFormError(error, "subcategory");
    return {
      success: false,
      errors: { [formError.field]: [formError.message] },
    };
  }

  if (uploaded) {
    await deleteCatalogImage({
      tenantSlug: tenant.slug,
      imageUrl: subcategory.imageUrl,
      resolveTenant,
    });
  }

  revalidateManagedCatalog(storeId, tenant, [
    "/",
    "/subcategories",
    `/categories/${subcategory.categoryId}/products`,
    `/categories/${data.categoryId}/products`,
  ]);
  redirect(managedPath(storeId, "subcategories"));
}

export async function deleteManagedSubcategory(
  storeId: number,
  subcategoryId: number
): Promise<void> {
  const { db, tenant } = await requireStoreManagementDb(
    storeId,
    "catalog.manage"
  );
  const resolveTenant = trustedMediaResolver(tenant);

  let subcategory;
  try {
    [subcategory] = await db
      .delete(subcategories)
      .where(eq(subcategories.id, subcategoryId))
      .returning();
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new Error("Subcategory cannot be deleted while it has products.");
    }
    throw error;
  }

  if (!subcategory) notFound();
  await deleteCatalogImage({
    tenantSlug: tenant.slug,
    imageUrl: subcategory.imageUrl,
    resolveTenant,
  });
  revalidateManagedCatalog(storeId, tenant, [
    "/",
    "/subcategories",
    `/categories/${subcategory.categoryId}/products`,
  ]);
}

export async function addManagedProduct(
  storeId: number,
  _state: unknown,
  formData: FormData
) {
  const { db, tenant } = await requireStoreManagementDb(
    storeId,
    "catalog.manage"
  );
  const resolveTenant = trustedMediaResolver(tenant);
  const parsed = await productCreateSchema.safeParseAsync(
    Object.fromEntries(formData)
  );
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const { image, ...data } = parsed.data;
  const store = new DrizzleCatalogStore(db);

  try {
    await validateProductPlacement(
      store,
      data.categoryId,
      data.subcategoryId
    );
  } catch (error) {
    const formError = catalogFormError(error, "product");
    return {
      success: false,
      errors: { [formError.field]: [formError.message] },
    };
  }

  const uploaded = await saveCatalogImage({
    tenantSlug: tenant.slug,
    kind: "products",
    file: image,
    resolveTenant,
  });

  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(products)
        .values({ ...data, imageUrl: uploaded.imageUrl })
        .returning({ id: products.id });

      await initializeInventoryAlertsInTransaction(
        new DrizzleInventoryTransaction(tx),
        created.id,
        new Date(),
        new DatabaseOnlyInventoryNotificationService()
      );
    });
  } catch (error) {
    await deleteCatalogImage({
      tenantSlug: tenant.slug,
      imageUrl: uploaded.imageUrl,
      resolveTenant,
    });
    const formError = catalogFormError(error, "product");
    return {
      success: false,
      errors: { [formError.field]: [formError.message] },
    };
  }

  revalidateManagedCatalog(storeId, tenant, [
    "/",
    "/products",
    `/categories/${data.categoryId}/products`,
  ]);
  redirect(managedPath(storeId, "products"));
}

export async function editManagedProduct(
  storeId: number,
  productId: number,
  _state: unknown,
  formData: FormData
) {
  const { db, tenant } = await requireStoreManagementDb(
    storeId,
    "catalog.manage"
  );
  const resolveTenant = trustedMediaResolver(tenant);
  const parsed = await productEditSchema.safeParseAsync(
    Object.fromEntries(formData)
  );
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) notFound();

  const { image, ...data } = parsed.data;
  const store = new DrizzleCatalogStore(db);

  try {
    await validateProductPlacement(
      store,
      data.categoryId,
      data.subcategoryId
    );
  } catch (error) {
    const formError = catalogFormError(error, "product");
    return {
      success: false,
      errors: { [formError.field]: [formError.message] },
    };
  }

  let imageUrl = product.imageUrl;
  let uploaded: Awaited<ReturnType<typeof saveCatalogImage>> | null = null;

  if (image) {
    uploaded = await saveCatalogImage({
      tenantSlug: tenant.slug,
      kind: "products",
      file: image,
    });
    imageUrl = uploaded.imageUrl;
  }

  try {
    await db.transaction(async (tx) => {
      await adjustInventoryInTransaction(
        new DrizzleInventoryTransaction(tx),
        productId,
        {
          physical: data.quantity,
          lowStockThreshold: data.lowStockThreshold,
          criticalStockThreshold: data.criticalStockThreshold,
        },
        new DatabaseOnlyInventoryNotificationService()
      );

      await tx
        .update(products)
        .set({
          name: data.name,
          description: data.description,
          price: data.price,
          categoryId: data.categoryId,
          subcategoryId: data.subcategoryId,
          imageUrl,
        })
        .where(eq(products.id, productId));
    });
  } catch (error) {
    if (uploaded) {
      await deleteCatalogImage({
        tenantSlug: tenant.slug,
        imageUrl: uploaded.imageUrl,
        resolveTenant,
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

  if (uploaded) {
    await deleteCatalogImage({
      tenantSlug: tenant.slug,
      imageUrl: product.imageUrl,
      resolveTenant,
    });
  }

  revalidateManagedCatalog(storeId, tenant, [
    "/",
    "/products",
    `/categories/${product.categoryId}/products`,
    `/categories/${data.categoryId}/products`,
  ]);
  redirect(managedPath(storeId, "products"));
}

export async function deleteManagedProduct(
  storeId: number,
  productId: number
): Promise<void> {
  const { db, tenant } = await requireStoreManagementDb(
    storeId,
    "catalog.manage"
  );
  const resolveTenant = trustedMediaResolver(tenant);

  let product;
  try {
    [product] = await db
      .delete(products)
      .where(eq(products.id, productId))
      .returning();
  } catch (error) {
    if (isForeignKeyViolation(error)) {
      throw new Error(
        "Product cannot be deleted because it is referenced by an order."
      );
    }
    throw error;
  }

  if (!product) notFound();
  await deleteCatalogImage({
    tenantSlug: tenant.slug,
    imageUrl: product.imageUrl,
    resolveTenant,
  });
  revalidateManagedCatalog(storeId, tenant, [
    "/",
    "/products",
    `/categories/${product.categoryId}/products`,
  ]);
}
