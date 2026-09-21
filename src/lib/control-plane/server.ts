import "server-only";

import { asc, count, eq, isNull, max, sql } from "drizzle-orm";
import { controlPlaneTenants } from "@/drizzle/control-plane-schema";
import { getControlPlaneDb, getDbForTenant } from "@/drizzle/db";
import { orders } from "@/drizzle/schema";
import type { TrustedTenant } from "@/lib/tenant-registry/core";
import { requireSuperAdmin } from "@/lib/admin-auth/server";
import {
  authorizeStoreMutation,
  buildStoreSummaries,
  ControlPlaneError,
  hasValidTenantIdentity,
  summarizePlatform,
  type ControlPlaneStore,
  type StoreMetrics,
  type StoreMutation,
} from "./core";

const storeSelection = {
  id: controlPlaneTenants.id,
  slug: controlPlaneTenants.slug,
  schemaName: controlPlaneTenants.schemaName,
  displayName: controlPlaneTenants.displayName,
  status: controlPlaneTenants.status,
  plan: controlPlaneTenants.plan,
  featured: controlPlaneTenants.featured,
  featuredRank: controlPlaneTenants.featuredRank,
  supportNotes: controlPlaneTenants.supportNotes,
  suspendedAt: controlPlaneTenants.suspendedAt,
  createdAt: controlPlaneTenants.createdAt,
  updatedAt: controlPlaneTenants.updatedAt,
};

export async function listControlPlaneStores(): Promise<ControlPlaneStore[]> {
  await requireSuperAdmin();
  return getControlPlaneDb()
    .select(storeSelection)
    .from(controlPlaneTenants)
    .orderBy(asc(controlPlaneTenants.displayName));
}

export async function getControlPlaneStore(slug: string) {
  await requireSuperAdmin();
  const [store] = await getControlPlaneDb()
    .select(storeSelection)
    .from(controlPlaneTenants)
    .where(eq(controlPlaneTenants.slug, slug))
    .limit(1);
  if (!store) return null;
  return (await buildStoreSummaries([store], loadTenantMetrics))[0];
}

export async function getControlPlaneOverview() {
  const stores = await listControlPlaneStores();
  const summaries = await buildStoreSummaries(stores, loadTenantMetrics);
  return { stores: summaries, metrics: summarizePlatform(summaries) };
}

export async function updateControlPlaneStore(input: unknown) {
  const principal = await requireSuperAdmin();
  const update = authorizeStoreMutation(principal, input);
  const [existing] = await getControlPlaneDb()
    .select(storeSelection)
    .from(controlPlaneTenants)
    .where(eq(controlPlaneTenants.slug, update.slug))
    .limit(1);
  if (!existing || !hasValidTenantIdentity(existing)) {
    throw new ControlPlaneError("NOT_FOUND", "Unknown store");
  }
  const [updated] = await getControlPlaneDb()
    .update(controlPlaneTenants)
    .set({
      status: update.status,
      plan: update.plan,
      featured: update.featured,
      featuredRank: update.featured ? update.featuredRank : null,
      supportNotes: update.supportNotes,
      suspendedAt:
        update.status === "suspended"
          ? existing.suspendedAt ?? new Date()
          : null,
      suspendedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(controlPlaneTenants.id, existing.id))
    .returning(storeSelection);
  return updated;
}

async function loadTenantMetrics(tenant: TrustedTenant): Promise<StoreMetrics> {
  const db = getDbForTenant(tenant);
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({
      orderCount: count(orders.id),
      salesVolume: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' then ${orders.totalPrice} else 0 end), 0)`,
      ordersToday: sql<number>`count(case when ${orders.createdAt} >= ${dayStart} then 1 end)`,
      revenueToday: sql<number>`coalesce(sum(case when ${orders.paymentStatus} = 'paid' and ${orders.createdAt} >= ${dayStart} then ${orders.totalPrice} else 0 end), 0)`,
      unsupportedCurrencyCount: sql<number>`count(case when ${orders.currency} <> 'ILS' then 1 end)`,
      lastActivity: max(orders.createdAt),
    })
    .from(orders)
    .where(isNull(orders.deletedAt));

  if (safeMetric(row?.unsupportedCurrencyCount) > 0) {
    throw new Error("Cannot aggregate mixed currencies");
  }
  return {
    orderCount: safeMetric(row?.orderCount),
    salesVolume: safeMetric(row?.salesVolume),
    ordersToday: safeMetric(row?.ordersToday),
    revenueToday: safeMetric(row?.revenueToday),
    lastActivity: row?.lastActivity ?? null,
  };
}

function safeMetric(value: unknown) {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error("Unsafe aggregate value");
  }
  return number;
}

export type { StoreMutation };
