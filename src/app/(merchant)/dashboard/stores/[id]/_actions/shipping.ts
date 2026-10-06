"use server";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import z from "zod";
import { shippingMethods } from "@/drizzle/schema";
import {
  getOrganizationLogoForStore,
  organizationLogoPublicUrl,
  saveOrganizationLogoForStore,
} from "@/lib/organization-logo-library/server";
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

const wholeIlsPriceSchema = z.preprocess(
  (value) =>
    typeof value === "string" && value.trim() === ""
      ? undefined
      : value,
  z.coerce.number().int().nonnegative().safe()
);

const shippingMethodSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    price: wholeIlsPriceSchema,
    requiresAddress: z.boolean(),
    logo: optionalLogoSchema,
    logoAssetId: z.preprocess(
      (value) =>
        value == null ||
        (typeof value === "string" && value.trim() === "")
          ? undefined
          : value,
      z.coerce.number().int().positive().safe().optional()
    ),
    removeLogo: z.boolean(),
  })
  .refine((value) => !(value.logo && value.logoAssetId), {
    path: ["logo"],
    message: "Choose either an uploaded logo or an existing logo asset.",
  })
  .refine(
    (value) =>
      !(
        value.removeLogo &&
        (value.logo !== undefined || value.logoAssetId !== undefined)
      ),
    {
      path: ["removeLogo"],
      message: "Cannot remove and replace a logo in the same request.",
    }
  );

const reorderSchema = z
  .array(z.number().int().positive().safe())
  .refine((ids) => new Set(ids).size === ids.length);

async function parseMethod(formData: FormData) {
  return shippingMethodSchema.safeParseAsync({
    name: formData.get("name"),
    price: formData.get("price"),
    requiresAddress: formData.get("requiresAddress") === "on",
    logo: formData.get("logo"),
    logoAssetId: formData.get("logoAssetId"),
    removeLogo: formData.get("removeLogo") === "on",
  });
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

  const { logo, logoAssetId } = parsed.data;
  const method = {
    name: parsed.data.name,
    price: parsed.data.price,
    requiresAddress: parsed.data.requiresAddress,
    isActive: false,
  };

  const uploaded = logo
    ? await saveOrganizationLogoForStore(storeId, logo)
    : null;

  const selectedAsset =
    !uploaded && logoAssetId
      ? await getOrganizationLogoForStore(storeId, logoAssetId)
      : null;

  if (!uploaded && logoAssetId && !selectedAsset) {
    return { ok: false, code: "invalid_logo" };
  }

  const logoUrl = uploaded
    ? organizationLogoPublicUrl(uploaded)
    : selectedAsset
      ? organizationLogoPublicUrl(selectedAsset)
      : null;

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
      .where(isNull(shippingMethods.deletedAt))
      .orderBy(asc(shippingMethods.sortOrder), asc(shippingMethods.id))
      .for("update");

    const sortOrder = getNextShippingSortOrder(
      existing.map((candidate) => candidate.sortOrder)
    );

    await tx.insert(shippingMethods).values({
      ...method,
      logoUrl,
      sortOrder,
    });
  });

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
    .where(
      and(
        eq(shippingMethods.id, methodId),
        isNull(shippingMethods.deletedAt)
      )
    )
    .limit(1);

  if (!existing) {
    return { ok: false, code: "invalid_method" };
  }

  const { logo, logoAssetId, removeLogo, ...method } = parsed.data;

  const uploaded = logo
    ? await saveOrganizationLogoForStore(storeId, logo)
    : null;

  const selectedAsset =
    !uploaded && logoAssetId
      ? await getOrganizationLogoForStore(storeId, logoAssetId)
      : null;

  if (!uploaded && logoAssetId && !selectedAsset) {
    return { ok: false, code: "invalid_logo" };
  }

  const logoUrl = uploaded
    ? organizationLogoPublicUrl(uploaded)
    : selectedAsset
      ? organizationLogoPublicUrl(selectedAsset)
      : removeLogo
        ? null
        : existing.logoUrl;

  const updated = await db
    .update(shippingMethods)
    .set({
      ...method,
      logoUrl,
    })
    .where(
      and(
        eq(shippingMethods.id, methodId),
        isNull(shippingMethods.deletedAt)
      )
    )
    .returning({ id: shippingMethods.id });

  if (updated.length !== 1) {
    return { ok: false, code: "invalid_method" };
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

  const updated = await db
    .update(shippingMethods)
    .set({ logoUrl: null })
    .where(
      and(
        eq(shippingMethods.id, methodId),
        isNull(shippingMethods.deletedAt)
      )
    )
    .returning({ id: shippingMethods.id });

  if (updated.length !== 1) {
    return { ok: false, code: "invalid_method" };
  }

  revalidateShipping(storeId, tenant.basePath);
  return { ok: true };
}

export async function deleteManagedShippingMethod(
  storeId: number,
  methodId: number
): Promise<
  { ok: true; undoVersion: string } | { ok: false; code: string }
> {
  const { db, tenant } = await requireStoreManagementDb(
    storeId,
    "shipping.manage"
  );

  if (!Number.isSafeInteger(methodId) || methodId <= 0) {
    return { ok: false, code: "invalid_method" };
  }

  const deletedAt = new Date();
  const [deleted] = await db
    .update(shippingMethods)
    .set({ deletedAt })
    .where(
      and(
        eq(shippingMethods.id, methodId),
        isNull(shippingMethods.deletedAt)
      )
    )
    .returning({ id: shippingMethods.id });

  if (!deleted) {
    return { ok: false, code: "invalid_method" };
  }

  revalidateShipping(storeId, tenant.basePath);
  return { ok: true, undoVersion: deletedAt.toISOString() };
}

export async function undoManagedShippingMethodDelete(
  storeId: number,
  methodId: number,
  undoVersion: string
): Promise<ShippingMutationResult> {
  const { db, tenant } = await requireStoreManagementDb(
    storeId,
    "shipping.manage"
  );

  if (!Number.isSafeInteger(methodId) || methodId <= 0) {
    return { ok: false, code: "invalid_method" };
  }

  const deletedAt = new Date(undoVersion);
  if (Number.isNaN(deletedAt.getTime())) {
    return { ok: false, code: "undo_failed" };
  }

  const [restored] = await db
    .update(shippingMethods)
    .set({ deletedAt: null })
    .where(
      and(
        eq(shippingMethods.id, methodId),
        eq(shippingMethods.deletedAt, deletedAt)
      )
    )
    .returning({ id: shippingMethods.id });

  if (!restored) {
    return { ok: false, code: "undo_failed" };
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
    .where(
      and(
        eq(shippingMethods.id, methodId),
        isNull(shippingMethods.deletedAt)
      )
    )
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
              .where(isNull(shippingMethods.deletedAt))
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
                .where(
                  and(
                    eq(shippingMethods.id, update.id),
                    isNull(shippingMethods.deletedAt)
                  )
                );
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

export async function createManagedShippingMethodForm(
  storeId: number,
  _previousState: { success: boolean; errors: Record<string, string[]> },
  formData: FormData
) {
  const result = await createManagedShippingMethod(storeId, formData);

  if (!result.ok) {
    return {
      success: false,
      errors: {
        _form: [result.code ?? "shipping_save_failed"],
      },
    };
  }

  redirect(`/dashboard/stores/${storeId}/shipping`);
}

export async function updateManagedShippingMethodForm(
  storeId: number,
  methodId: number,
  _previousState: { success: boolean; errors: Record<string, string[]> },
  formData: FormData
) {
  const result = await updateManagedShippingMethod(storeId, methodId, formData);

  if (!result.ok) {
    return {
      success: false,
      errors: {
        _form: [result.code ?? "shipping_save_failed"],
      },
    };
  }

  redirect(`/dashboard/stores/${storeId}/shipping`);
}
