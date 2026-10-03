import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/control-db";
import {
  controlPlaneTenants,
  organizationMemberships,
  storeManagerAssignments,
  stores,
} from "@/drizzle/control-plane-schema";
import type {
  StoreManagementRecord,
  StoreManagementRepository,
} from "./core";

const selection = {
  storeId: stores.id,
  organizationId: stores.organizationId,
  displayName: stores.displayName,
  slug: stores.slug,
  status: stores.status,
  tenantId: stores.tenantId,
  deletedAt: stores.deletedAt,
  tenantRowId: controlPlaneTenants.id,
  tenantSlug: controlPlaneTenants.slug,
  schemaName: controlPlaneTenants.schemaName,
  tenantDisplayName: controlPlaneTenants.displayName,
  tenantStatus: controlPlaneTenants.status,
};

type SelectionRow = {
  storeId: number;
  organizationId: number;
  displayName: string;
  slug: string;
  status:
    | "draft"
    | "ready_for_provisioning"
    | "activation_requested"
    | "provisioning"
    | "provisioning_failed"
    | "provisioned";
  tenantId: number | null;
  deletedAt: Date | null;
  tenantRowId: number | null;
  tenantSlug: string | null;
  schemaName: string | null;
  tenantDisplayName: string | null;
  tenantStatus: "active" | "suspended" | "disabled" | null;
};

function mapRecord(row: SelectionRow): StoreManagementRecord {
  const tenant =
    row.tenantRowId !== null &&
    row.tenantSlug !== null &&
    row.schemaName !== null &&
    row.tenantDisplayName !== null &&
    row.tenantStatus !== null
      ? {
          id: row.tenantRowId,
          slug: row.tenantSlug,
          schemaName: row.schemaName,
          displayName: row.tenantDisplayName,
          status: row.tenantStatus,
        }
      : null;

  return {
    store: {
      id: row.storeId,
      organizationId: row.organizationId,
      displayName: row.displayName,
      slug: row.slug,
      status: row.status,
      tenantId: row.tenantId,
      deletedAt: row.deletedAt,
    },
    tenant,
  };
}

export class DrizzleStoreManagementRepository
  implements StoreManagementRepository
{
  async findOwnedStore(
    merchantId: number,
    storeId: number
  ): Promise<StoreManagementRecord | null> {
    const [row] = await getControlPlaneDb()
      .select(selection)
      .from(stores)
      .innerJoin(
        organizationMemberships,
        and(
          eq(
            organizationMemberships.organizationId,
            stores.organizationId
          ),
          eq(
            organizationMemberships.merchantAccountId,
            merchantId
          ),
          eq(organizationMemberships.role, "owner")
        )
      )
      .leftJoin(
        controlPlaneTenants,
        eq(stores.tenantId, controlPlaneTenants.id)
      )
      .where(
        and(
          eq(stores.id, storeId),
          isNull(stores.deletedAt)
        )
      )
      .limit(1);

    return row ? mapRecord(row as SelectionRow) : null;
  }

  async listManagedStores(
    adminUserId: number
  ): Promise<StoreManagementRecord[]> {
    const rows = await getControlPlaneDb()
      .select(selection)
      .from(stores)
      .innerJoin(
        storeManagerAssignments,
        and(
          eq(storeManagerAssignments.storeId, stores.id),
          eq(storeManagerAssignments.adminUserId, adminUserId)
        )
      )
      .leftJoin(
        controlPlaneTenants,
        eq(stores.tenantId, controlPlaneTenants.id)
      )
      .where(isNull(stores.deletedAt))
      .orderBy(stores.id);

    return rows.map((row) => mapRecord(row as SelectionRow));
  }

  async findManagedStore(
    adminUserId: number,
    storeId: number
  ): Promise<StoreManagementRecord | null> {
    const [row] = await getControlPlaneDb()
      .select(selection)
      .from(stores)
      .innerJoin(
        storeManagerAssignments,
        and(
          eq(storeManagerAssignments.storeId, stores.id),
          eq(storeManagerAssignments.adminUserId, adminUserId)
        )
      )
      .leftJoin(
        controlPlaneTenants,
        eq(stores.tenantId, controlPlaneTenants.id)
      )
      .where(
        and(
          eq(stores.id, storeId),
          isNull(stores.deletedAt)
        )
      )
      .limit(1);

    return row ? mapRecord(row as SelectionRow) : null;
  }
}
