"use server";

import { asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import z from "zod";
import { shippingMethods } from "@/drizzle/schema";
import {
  deleteCatalogImage,
  saveCatalogImage,
} from "@/lib/media/catalog-media";
import {
  ImageValidationError,
  validateCatalogImage,
} from "@/lib/media/validate-image.mjs";
import { requireStoreManagementDb } from "@/lib/store-management/server";
import {
  getNextShippingSortOrder,
  reorderShippingMethods,
  ShippingOrderError,
} from "@/lib/shipping/order";

export type ShippingMutationResult = {
  ok: boolean;
  code?: string;
};

const logoSchema = z
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

const optionalLogoSchema = z.preprocess(
  (value) =>
    value instanceof File && value.size === 0 ? undefined : value,
  logoSchema.optional()
);

const shippingMethodSchema = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.coerce.number().int().nonnegative().safe(),
  requiresAddress: z.boolean(),
  isActive: z.boolean(),
  logo: optionalLogoSchema,
  removeLogo: z.boolean(),
});

const reorderSchema = z
  .array(z.number().int().positive().safe())
  .refine((ids) => new Set(ids).size === ids.length);

async function parseMethod(formData: FormData) {
  return shippingMethodSchema.safeParseAsync({
    name: formData.get("name"),
    price: formData.get("price"),
    requiresAddress: formData.get("requiresAddress") === "on",
    isActive: formData.get("isActive") === "on",
    logo: formData.get("logo"),
    removeLogo: formData.get("removeLogo") === "on",
  });
}

function trustedMediaResolver(tenant: {
  slug: string;
  schema: string;
  basePath: string;
}) {
  return (value: unknown) =>
    typeof value === "string" && value === tenant.slug ? tenant : null;
}

function revalidateShipping(storeId: number, tenantBasePath: string) {
  revalidatePath(`/dashboard/stores/${storeId}/shipping`);
  revalidatePath(`${tenantBasePath}/checkout`);
}

export async function createManagedShippingMethod(
  storeId: number,
  formData: FormData
): Promise<ShippingMutationResult> {
  const { db, tenant } = await requireStoreManagementDb(
    storeId,
    "shipping.manage"
  );

  const parsed = await parseMethod(formData);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const resolveTenant = trustedMediaResolver(tenant);
  const { logo } = parsed.data;
  const method = {
    name: parsed.data.name,
    price: parsed.data.price,
    requiresAddress: parsed.data.requiresAddress,
    isActive: parsed.data.isActive,
  };

  const uploaded = logo
    ? await saveCatalogImage({
        tenantSlug: tenant.slug,
        kind: "shipping",
        file: logo,
        resolveTenant,
      })
    : null;

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(current_schema() || ':shipping_methods_order', 0))`
      );

      const existing = await tx
        .select({
          id: shippingMethods.id,
          sortOrder: shippingMethods.sortOrder,
        })
        .from(shippingMethods)
        .orderBy(asc(shippingMethods.sortOrder), asc(shippingMethods.id))
        .for("update");

      const sortOrder = getNextShippingSortOrder(
        existing.map((candidate) => candidate.sortOrder)
      );

      await tx.insert(shippingMethods).values({
        ...method,
        logoUrl: uploaded?.imageUrl ?? null,
        sortOrder,
      });
    });
  } catch (error) {
    if (uploaded) {
      await deleteCatalogImage({
        tenantSlug: tenant.slug,
        imageUrl: uploaded.imageUrl,
        resolveTenant,
      });
    }

    throw error;
  }

  revalidateShipping(storeId, tenant.basePath);
  return { ok: true };
}

export async function updateManagedShippingMethod(
  storeId: number,
  methodId: number,
  formData: FormData
): Promise<ShippingMutationResult> {
  const { db, tenant } = await requireStoreManagementDb(
    storeId,
    "shipping.manage"
  );

  if (!Number.isSafeInteger(methodId) || methodId <= 0) {
    return { ok: false, code: "invalid_method" };
  }

  const parsed = await parseMethod(formData);
  if (!parsed.success) return { ok: false, code: "invalid_input" };

  const [existing] = await db
    .select({
      id: shippingMethods.id,
      logoUrl: shippingMethods.logoUrl,
    })
    .from(shippingMethods)
    .where(eq(shippingMethods.id, methodId))
    .limit(1);

  if (!existing) {
    return { ok: false, code: "invalid_method" };
  }

  const resolveTenant = trustedMediaResolver(tenant);
  const { logo, removeLogo, ...method } = parsed.data;

  const uploaded = logo
    ? await saveCatalogImage({
        tenantSlug: tenant.slug,
        kind: "shipping",
        file: logo,
        resolveTenant,
      })
    : null;

  const logoUrl = uploaded
    ? uploaded.imageUrl
    : removeLogo
      ? null
      : existing.logoUrl;

  try {
    const updated = await db
      .update(shippingMethods)
      .set({
        ...method,
        logoUrl,
      })
      .where(eq(shippingMethods.id, methodId))
      .returning({ id: shippingMethods.id });

    if (updated.length !== 1) {
      if (uploaded) {
        await deleteCatalogImage({
          tenantSlug: tenant.slug,
          imageUrl: uploaded.imageUrl,
          resolveTenant,
        });
      }

      return { ok: false, code: "invalid_method" };
    }
  } catch (error) {
    if (uploaded) {
      await deleteCatalogImage({
        tenantSlug: tenant.slug,
        imageUrl: uploaded.imageUrl,
        resolveTenant,
      });
    }

    throw error;
  }

  if ((uploaded || removeLogo) && existing.logoUrl) {
    await deleteCatalogImage({
      tenantSlug: tenant.slug,
      imageUrl: existing.logoUrl,
      resolveTenant,
    });
  }

  revalidateShipping(storeId, tenant.basePath);
  return { ok: true };
}

export async function removeManagedShippingLogo(
  storeId: number,
  methodId: number
): Promise<ShippingMutationResult> {
  const { db, tenant } = await requireStoreManagementDb(
    storeId,
    "shipping.manage"
  );

  if (!Number.isSafeInteger(methodId) || methodId <= 0) {
    return { ok: false, code: "invalid_method" };
  }

  const [existing] = await db
    .select({
      id: shippingMethods.id,
      logoUrl: shippingMethods.logoUrl,
    })
    .from(shippingMethods)
    .where(eq(shippingMethods.id, methodId))
    .limit(1);

  if (!existing) {
    return { ok: false, code: "invalid_method" };
  }

  await db
    .update(shippingMethods)
    .set({ logoUrl: null })
    .where(eq(shippingMethods.id, methodId));

  if (existing.logoUrl) {
    await deleteCatalogImage({
      tenantSlug: tenant.slug,
      imageUrl: existing.logoUrl,
      resolveTenant: trustedMediaResolver(tenant),
    });
  }

  revalidateShipping(storeId, tenant.basePath);
  return { ok: true };
}

export async function toggleManagedShippingMethod(
  storeId: number,
  methodId: number,
  active: boolean
): Promise<ShippingMutationResult> {
  const { db, tenant } = await requireStoreManagementDb(
    storeId,
    "shipping.manage"
  );

  if (
    !Number.isSafeInteger(methodId) ||
    methodId <= 0 ||
    typeof active !== "boolean"
  ) {
    return { ok: false, code: "invalid_input" };
  }

  const updated = await db
    .update(shippingMethods)
    .set({ isActive: active })
    .where(eq(shippingMethods.id, methodId))
    .returning({ id: shippingMethods.id });

  if (updated.length !== 1) {
    return { ok: false, code: "invalid_method" };
  }

  revalidateShipping(storeId, tenant.basePath);
  return { ok: true };
}

export async function reorderManagedShippingMethods(
  storeId: number,
  orderedIds: unknown
): Promise<ShippingMutationResult> {
  const { db, tenant } = await requireStoreManagementDb(
    storeId,
    "shipping.manage"
  );

  const parsed = reorderSchema.safeParse(orderedIds);
  if (!parsed.success) return { ok: false, code: "invalid_order" };

  try {
    await db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(current_schema() || ':shipping_methods_order', 0))`
      );

      await reorderShippingMethods(
        {
          async listMethodIds() {
            const rows = await tx
              .select({ id: shippingMethods.id })
              .from(shippingMethods)
              .orderBy(
                asc(shippingMethods.sortOrder),
                asc(shippingMethods.id)
              )
              .for("update");

            return rows.map((candidate) => candidate.id);
          },

          async updateSortOrders(updates) {
            for (const update of updates) {
              await tx
                .update(shippingMethods)
                .set({ sortOrder: update.sortOrder })
                .where(eq(shippingMethods.id, update.id));
            }
          },
        },
        parsed.data
      );
    });
  } catch (error) {
    if (error instanceof ShippingOrderError) {
      return { ok: false, code: error.code };
    }

    throw error;
  }

  revalidateShipping(storeId, tenant.basePath);
  return { ok: true };
}
