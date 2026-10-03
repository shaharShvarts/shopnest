import "server-only";

import { and, asc, count, eq, isNull, max, sql } from "drizzle-orm";
import {
  controlPlaneTenants,
  plans,
  stores,
  subscriptions,
} from "@/drizzle/control-plane-schema";
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
  storeId: stores.id,
  slug: stores.slug,
  displayName: stores.displayName,
  storeStatus: stores.status,
  tenantId: stores.tenantId,
  tenantSlug: controlPlaneTenants.slug,
  schemaName: controlPlaneTenants.schemaName,
  tenantStatus: controlPlaneTenants.status,
  plan: controlPlaneTenants.plan,
  subscriptionPlanCode: plans.code,
  subscriptionPlanName: plans.name,
  featured: controlPlaneTenants.featured,
  featuredRank: controlPlaneTenants.featuredRank,
  supportNotes: controlPlaneTenants.supportNotes,
  suspendedAt: controlPlaneTenants.suspendedAt,
  createdAt: stores.createdAt,
  updatedAt: stores.updatedAt,
};

function mapControlPlaneStore(
  row: Awaited<ReturnType<typeof selectStoreRows>>[number]
): ControlPlaneStore {
  return {
    storeId: row.storeId,
    slug: row.slug,
    displayName: row.displayName,
    storeStatus: row.storeStatus,
    tenantId: row.tenantId,
    tenantSlug: row.tenantSlug,
    schemaName: row.schemaName,
    tenantStatus: row.tenantStatus,
    plan: row.plan,
    subscriptionPlanCode: row.subscriptionPlanCode,
    subscriptionPlanName: row.subscriptionPlanName,
    featured: row.featured ?? false,
    featuredRank: row.featuredRank,
    supportNotes: row.supportNotes,
    suspendedAt: row.suspendedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function selectStoreRows() {
  return getControlPlaneDb()
    .select(storeSelection)
    .from(stores)
    .leftJoin(
      controlPlaneTenants,
      eq(controlPlaneTenants.id, stores.tenantId)
    )
    .leftJoin(
      subscriptions,
      and(
        eq(subscriptions.storeId, stores.id),
        eq(subscriptions.organizationId, stores.organizationId)
      )
    )
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(isNull(stores.deletedAt))
    .orderBy(asc(stores.displayName));
}

export async function listControlPlaneStores(): Promise<ControlPlaneStore[]> {
  await requireSuperAdmin();
  const rows = await selectStoreRows();
  return rows.map(mapControlPlaneStore);
}

export async function getControlPlaneStore(slug: string) {
  await requireSuperAdmin();
  const [row] = await getControlPlaneDb()
    .select(storeSelection)
    .from(stores)
    .leftJoin(
      controlPlaneTenants,
      eq(controlPlaneTenants.id, stores.tenantId)
    )
    .leftJoin(
      subscriptions,
      and(
        eq(subscriptions.storeId, stores.id),
        eq(subscriptions.organizationId, stores.organizationId)
      )
    )
    .leftJoin(plans, eq(plans.id, subscriptions.planId))
    .where(and(eq(stores.slug, slug), isNull(stores.deletedAt)))
    .limit(1);

  if (!row) return null;
  return (await buildStoreSummaries([mapControlPlaneStore(row)], loadTenantMetrics))[0];
}

export async function getControlPlaneOverview() {
  const storeRows = await listControlPlaneStores();
  const summaries = await buildStoreSummaries(storeRows, loadTenantMetrics);
  return { stores: summaries, metrics: summarizePlatform(summaries) };
}

export async function updateControlPlaneStore(input: unknown) {
  const principal = await requireSuperAdmin();
  const update = authorizeStoreMutation(principal, input);

  const [existing] = await getControlPlaneDb()
    .select({
      tenantId: stores.tenantId,
      tenantSlug: controlPlaneTenants.slug,
      schemaName: controlPlaneTenants.schemaName,
    })
    .from(stores)
    .innerJoin(
      controlPlaneTenants,
      eq(controlPlaneTenants.id, stores.tenantId)
    )
    .where(
      and(
        eq(stores.slug, update.slug),
        isNull(stores.deletedAt)
      )
    )
    .limit(1);

  if (
    !existing ||
    existing.tenantId === null ||
    !hasValidTenantIdentity(existing)
  ) {
    throw new ControlPlaneError(
      "NOT_FOUND",
      "Provisioned Store tenant not found"
    );
  }

  const [updated] = await getControlPlaneDb()
    .update(controlPlaneTenants)
    .set({
      status: update.status,
      featured: update.featured,
      featuredRank: update.featured ? update.featuredRank : null,
      supportNotes: update.supportNotes,
      suspendedAt:
        update.status === "suspended"
          ? sql`coalesce(${controlPlaneTenants.suspendedAt}, now())`
          : null,
      suspendedReason: null,
      updatedAt: new Date(),
    })
    .where(eq(controlPlaneTenants.id, existing.tenantId))
    .returning();

  if (!updated) {
    throw new ControlPlaneError("NOT_FOUND", "Tenant update failed");
  }

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
