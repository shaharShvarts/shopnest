"use server";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { fulfillmentStatuses, orders, shippingMethods } from "@/drizzle/schema";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { revalidateTenantPath } from "@/lib/tenant-context";
import { buildFulfillmentUpdate } from "@/lib/shipping/fulfillment";
import {
  getNextShippingSortOrder,
  reorderShippingMethods,
  ShippingOrderError,
} from "@/lib/shipping/order";

const shippingMethodSchema = z.object({
  name: z.string().trim().min(1).max(120),
  price: z.coerce.number().int().nonnegative().safe(),
  requiresAddress: z.boolean(),
  isActive: z.boolean(),
});

function parseMethod(formData: FormData) {
  return shippingMethodSchema.parse({
    ...Object.fromEntries(formData),
    requiresAddress: formData.get("requiresAddress") === "on",
    isActive: formData.get("isActive") === "on",
  });
}

export async function createShippingMethod(formData: FormData) {
  const { db, tenant } = await requireTenantAdminDb();
  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(current_schema() || ':shipping_methods_order', 0))`
    );
    const existing = await tx
      .select({ id: shippingMethods.id, sortOrder: shippingMethods.sortOrder })
      .from(shippingMethods)
      .where(isNull(shippingMethods.deletedAt))
      .orderBy(asc(shippingMethods.sortOrder), asc(shippingMethods.id))
      .for("update");
    let sortOrder = getNextShippingSortOrder(
      existing.map((method) => method.sortOrder)
    );
    if (sortOrder > 1_000_000) {
      for (const [index, method] of existing.entries()) {
        await tx
          .update(shippingMethods)
          .set({ sortOrder: index })
          .where(eq(shippingMethods.id, method.id));
      }
      sortOrder = existing.length;
    }
    await tx.insert(shippingMethods).values({
      ...parseMethod(formData),
      sortOrder,
    });
  });
  await revalidateTenantPath("/admin/shipping");
  redirect(`${tenant.basePath}/admin/shipping`);
}

export async function updateShippingMethod(id: number, formData: FormData) {
  const { db, tenant } = await requireTenantAdminDb();
  const updated = await db
    .update(shippingMethods)
    .set(parseMethod(formData))
    .where(
      and(
        eq(shippingMethods.id, id),
        isNull(shippingMethods.deletedAt)
      )
    )
    .returning({ id: shippingMethods.id });
  if (!updated.length) notFound();
  await revalidateTenantPath("/admin/shipping");
  redirect(`${tenant.basePath}/admin/shipping`);
}

export async function toggleShippingMethod(id: number, active: boolean) {
  const { db } = await requireTenantAdminDb();
  await db
    .update(shippingMethods)
    .set({ isActive: active })
    .where(
      and(
        eq(shippingMethods.id, id),
        isNull(shippingMethods.deletedAt)
      )
    );
  await revalidateTenantPath("/admin/shipping");
  await revalidateTenantPath("/checkout");
}

export type ReorderShippingState = {
  success: boolean;
  message?: string;
};

export async function reorderShippingMethodAction(
  _previousState: ReorderShippingState,
  formData: FormData
): Promise<ReorderShippingState> {
  let submitted: unknown;
  try {
    submitted = JSON.parse(String(formData.get("orderedIds") ?? ""));
  } catch {
    return { success: false, message: "Invalid shipping method order." };
  }
  const result = z.array(z.number().int().positive().safe()).safeParse(submitted);
  if (!result.success) {
    return { success: false, message: "Invalid shipping method order." };
  }

  const { db } = await requireTenantAdminDb();
  try {
    await db.transaction(async (tx) => {
      await reorderShippingMethods(
        {
          async listMethodIds() {
            const rows = await tx
              .select({ id: shippingMethods.id })
              .from(shippingMethods)
              .where(isNull(shippingMethods.deletedAt))
              .orderBy(asc(shippingMethods.sortOrder), asc(shippingMethods.id))
              .for("update");
            return rows.map((method) => method.id);
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
        result.data
      );
    });
  } catch (error) {
    if (error instanceof ShippingOrderError) {
      return { success: false, message: error.message };
    }
    throw error;
  }

  await revalidateTenantPath("/admin/shipping");
  await revalidateTenantPath("/checkout");
  return { success: true, message: "Shipping order saved." };
}

const fulfillmentSchema = z.object({
  status: z.enum(fulfillmentStatuses),
  trackingNumber: z.string().trim().max(160).nullable(),
});

export async function updateOrderFulfillment(orderId: number, formData: FormData) {
  const { db } = await requireTenantAdminDb();
  const input = fulfillmentSchema.parse({
    status: formData.get("status"),
    trackingNumber: formData.get("trackingNumber") || null,
  });
  const [order] = await db.select({
    fulfillmentStatus: orders.fulfillmentStatus,
    trackingNumber: orders.trackingNumber,
    shippedAt: orders.shippedAt,
    deliveredAt: orders.deliveredAt,
    readyForPickupAt: orders.readyForPickupAt,
    pickedUpAt: orders.pickedUpAt,
  }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) notFound();
  const update = buildFulfillmentUpdate(order, input);
  await db.update(orders).set(update).where(eq(orders.id, orderId));
  await revalidateTenantPath(`/admin/orders/${orderId}`);
  await revalidateTenantPath("/account/orders");
}
