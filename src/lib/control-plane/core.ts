import { z } from "zod";
import type { AdminPrincipal } from "../admin-auth/core.ts";
import type { StoreStatus, TenantStatus } from "@/drizzle/control-schema/shared";
import {
  tenantIdentityFromRegistryRecord,
  trustedTenantFromRegistryRecord,
  type TrustedTenant,
} from "../tenant-registry/core.ts";

export type ControlPlaneStore = {
  storeId: number;
  slug: string;
  displayName: string;
  storeStatus: StoreStatus;
  tenantId: number | null;
  tenantSlug: string | null;
  schemaName: string | null;
  tenantStatus: TenantStatus | null;
  plan: string | null;
  subscriptionPlanCode: string | null;
  subscriptionPlanName: string | null;
  featured: boolean;
  featuredRank: number | null;
  supportNotes: string | null;
  suspendedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoreMetrics = {
  orderCount: number;
  salesVolume: number;
  ordersToday: number;
  revenueToday: number;
  lastActivity: Date | null;
};

export type StoreMetricsResult =
  | { kind: "available"; metrics: StoreMetrics }
  | {
      kind: "unavailable";
      reason: "not_provisioned" | "untrusted_registry" | "query_failed";
    };

export type StoreSummary = ControlPlaneStore & StoreMetricsResult;

export const storeMutationSchema = z
  .object({
    slug: z.string().trim().min(1).max(63),
    status: z.enum(["active", "suspended", "disabled"]),
    featured: z.boolean(),
    featuredRank: z.number().int().positive().nullable(),
    supportNotes: z.string().trim().max(4000).nullable(),
  })
  .superRefine((value, context) => {
    if (!value.featured && value.featuredRank !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["featuredRank"],
        message: "Only featured stores may have a rank.",
      });
    }
  });

export type StoreMutation = z.infer<typeof storeMutationSchema>;

export function authorizeStoreMutation(
  principal: AdminPrincipal | null,
  input: unknown
): StoreMutation {
  if (!principal?.isActive || principal.role !== "super_admin") {
    throw new ControlPlaneError("FORBIDDEN", "Super admin access required");
  }
  const parsed = storeMutationSchema.safeParse(input);
  if (!parsed.success) {
    throw new ControlPlaneError("INVALID_INPUT", "Invalid store update");
  }
  return parsed.data;
}

export function resolveTrustedStore(
  store: ControlPlaneStore
): TrustedTenant | null {
  if (
    store.storeStatus !== "provisioned" ||
    store.tenantId === null ||
    store.tenantSlug === null ||
    store.schemaName === null ||
    store.tenantStatus === null
  ) {
    return null;
  }

  return trustedTenantFromRegistryRecord({
    slug: store.tenantSlug,
    schemaName: store.schemaName,
    status: store.tenantStatus,
  });
}

export function hasValidTenantIdentity(
  store: Pick<ControlPlaneStore, "tenantSlug" | "schemaName">
) {
  if (store.tenantSlug === null || store.schemaName === null) return false;
  return Boolean(
    tenantIdentityFromRegistryRecord({
      slug: store.tenantSlug,
      schemaName: store.schemaName,
    })
  );
}

export function findTrustedStore(stores: ControlPlaneStore[], slug: unknown) {
  if (typeof slug !== "string") return null;
  const store = stores.find((candidate) => candidate.slug === slug);
  return store && resolveTrustedStore(store) ? store : null;
}

export async function buildStoreSummaries(
  stores: ControlPlaneStore[],
  loadMetrics: (tenant: TrustedTenant) => Promise<StoreMetrics>
): Promise<StoreSummary[]> {
  return Promise.all(
    stores.map(async (store): Promise<StoreSummary> => {
      if (store.storeStatus !== "provisioned" || store.tenantId === null) {
        return { ...store, kind: "unavailable", reason: "not_provisioned" };
      }

      const tenant = resolveTrustedStore(store);
      if (!tenant) {
        return { ...store, kind: "unavailable", reason: "untrusted_registry" };
      }

      try {
        return { ...store, kind: "available", metrics: await loadMetrics(tenant) };
      } catch {
        return { ...store, kind: "unavailable", reason: "query_failed" };
      }
    })
  );
}

export function summarizePlatform(stores: StoreSummary[]) {
  const available = stores.filter(
    (store): store is ControlPlaneStore & { kind: "available"; metrics: StoreMetrics } =>
      store.kind === "available"
  );
  const metricFailures = stores.filter(
    (store) =>
      store.storeStatus === "provisioned" && store.kind === "unavailable"
  );

  return {
    registeredStores: stores.length,
    activeStores: stores.filter(
      (store) =>
        store.storeStatus === "provisioned" &&
        store.tenantStatus === "active"
    ).length,
    unavailableStores: stores.filter(
      (store) =>
        store.storeStatus === "provisioned" &&
        store.tenantStatus !== "active"
    ).length,
    totalOrders: available.reduce((total, store) => total + store.metrics.orderCount, 0),
    totalRevenue: available.reduce((total, store) => total + store.metrics.salesVolume, 0),
    ordersToday: available.reduce((total, store) => total + store.metrics.ordersToday, 0),
    revenueToday: available.reduce((total, store) => total + store.metrics.revenueToday, 0),
    complete: metricFailures.length === 0,
    failedStores: metricFailures.map((store) => store.slug),
  };
}

export class ControlPlaneError extends Error {
  readonly code: "FORBIDDEN" | "INVALID_INPUT" | "NOT_FOUND";

  constructor(code: "FORBIDDEN" | "INVALID_INPUT" | "NOT_FOUND", message: string) {
    super(message);
    this.name = "ControlPlaneError";
    this.code = code;
  }
}
