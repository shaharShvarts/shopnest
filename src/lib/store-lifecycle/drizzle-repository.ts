import { and, eq, isNull } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/db";
import {
  controlPlaneTenants,
  organizationMemberships,
  stores,
} from "@/drizzle/control-plane-schema";
import {
  applyStoreLifecycleTransition,
  assertSafeProvisioningErrorCode,
  assertTrustedTenantId,
  type StoreLifecycleSnapshot,
} from "./core";

const lifecycleSelection = {
  storeId: stores.id,
  organizationId: stores.organizationId,
  status: stores.status,
  tenantId: stores.tenantId,
  activationRequestedAt: stores.activationRequestedAt,
  provisioningStartedAt: stores.provisioningStartedAt,
  provisionedAt: stores.provisionedAt,
  lastProvisioningAttemptAt: stores.lastProvisioningAttemptAt,
  provisioningAttemptCount: stores.provisioningAttemptCount,
  lastProvisioningErrorCode: stores.lastProvisioningErrorCode,
  updatedAt: stores.updatedAt,
};

function asSnapshot(row: {
  storeId: number;
  organizationId: number;
  status: StoreLifecycleSnapshot["status"];
  tenantId: number | null;
  activationRequestedAt: Date | null;
  provisioningStartedAt: Date | null;
  provisionedAt: Date | null;
  lastProvisioningAttemptAt: Date | null;
  provisioningAttemptCount: number;
  lastProvisioningErrorCode: string | null;
  updatedAt: Date;
}): StoreLifecycleSnapshot {
  return { ...row };
}

function persistedLifecycleValues(snapshot: StoreLifecycleSnapshot) {
  return {
    status: snapshot.status,
    tenantId: snapshot.tenantId,
    activationRequestedAt: snapshot.activationRequestedAt,
    provisioningStartedAt: snapshot.provisioningStartedAt,
    provisionedAt: snapshot.provisionedAt,
    lastProvisioningAttemptAt: snapshot.lastProvisioningAttemptAt,
    provisioningAttemptCount: snapshot.provisioningAttemptCount,
    lastProvisioningErrorCode: snapshot.lastProvisioningErrorCode,
    updatedAt: snapshot.updatedAt,
  };
}

export type StoreLifecycleRepositoryErrorCode =
  | "NOT_FOUND"
  | "TENANT_MISMATCH";

export class StoreLifecycleRepositoryError extends Error {
  constructor(
    readonly code: StoreLifecycleRepositoryErrorCode,
    message: string
  ) {
    super(message);
    this.name = "StoreLifecycleRepositoryError";
  }
}

export interface StoreLifecycleRepository {
  findForOwnedStore(
    merchantId: number,
    storeId: number
  ): Promise<StoreLifecycleSnapshot | null>;

  syncReadinessForOwnedStore(
    merchantId: number,
    storeId: number,
    ready: boolean,
    now?: Date
  ): Promise<StoreLifecycleSnapshot | null>;

  requestActivationForOwnedStore(
    merchantId: number,
    storeId: number,
    now?: Date
  ): Promise<StoreLifecycleSnapshot | null>;

  startProvisioning(
    storeId: number,
    now?: Date
  ): Promise<StoreLifecycleSnapshot>;

  markProvisioningFailed(
    storeId: number,
    errorCode: string,
    now?: Date
  ): Promise<StoreLifecycleSnapshot>;

  markProvisioned(
    storeId: number,
    tenantId: number,
    now?: Date
  ): Promise<StoreLifecycleSnapshot>;
}

export class DrizzleStoreLifecycleRepository
  implements StoreLifecycleRepository
{
  async findForOwnedStore(
    merchantId: number,
    storeId: number
  ): Promise<StoreLifecycleSnapshot | null> {
    const [row] = await getControlPlaneDb()
      .select(lifecycleSelection)
      .from(stores)
      .innerJoin(
        organizationMemberships,
        and(
          eq(organizationMemberships.organizationId, stores.organizationId),
          eq(organizationMemberships.merchantAccountId, merchantId),
          eq(organizationMemberships.role, "owner")
        )
      )
      .where(and(eq(stores.id, storeId), isNull(stores.deletedAt)))
      .limit(1);

    return row ? asSnapshot(row) : null;
  }

  async syncReadinessForOwnedStore(
    merchantId: number,
    storeId: number,
    ready: boolean,
    now = new Date()
  ): Promise<StoreLifecycleSnapshot | null> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [row] = await tx
        .select(lifecycleSelection)
        .from(stores)
        .innerJoin(
          organizationMemberships,
          and(
            eq(organizationMemberships.organizationId, stores.organizationId),
            eq(organizationMemberships.merchantAccountId, merchantId),
            eq(organizationMemberships.role, "owner")
          )
        )
        .where(and(eq(stores.id, storeId), isNull(stores.deletedAt)))
        .limit(1)
        .for("update");

      if (!row) return null;

      const current = asSnapshot(row);
      let transition:
        | { to: "draft" }
        | { to: "ready_for_provisioning" }
        | null = null;

      if (ready) {
        if (
          current.status === "draft" ||
          current.status === "provisioning_failed"
        ) {
          transition = { to: "ready_for_provisioning" };
        }
      } else if (
        current.status === "ready_for_provisioning" ||
        current.status === "activation_requested" ||
        current.status === "provisioning_failed"
      ) {
        transition = { to: "draft" };
      }

      if (!transition) return current;

      const next = applyStoreLifecycleTransition(current, transition, now);
      const [updated] = await tx
        .update(stores)
        .set(persistedLifecycleValues(next))
        .where(eq(stores.id, storeId))
        .returning(lifecycleSelection);

      return asSnapshot(updated);
    });
  }

  async requestActivationForOwnedStore(
    merchantId: number,
    storeId: number,
    now = new Date()
  ): Promise<StoreLifecycleSnapshot | null> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [row] = await tx
        .select(lifecycleSelection)
        .from(stores)
        .innerJoin(
          organizationMemberships,
          and(
            eq(organizationMemberships.organizationId, stores.organizationId),
            eq(organizationMemberships.merchantAccountId, merchantId),
            eq(organizationMemberships.role, "owner")
          )
        )
        .where(and(eq(stores.id, storeId), isNull(stores.deletedAt)))
        .limit(1)
        .for("update");

      if (!row) return null;

      const current = asSnapshot(row);
      if (current.status === "activation_requested") return current;

      const next = applyStoreLifecycleTransition(
        current,
        { to: "activation_requested" },
        now
      );
      const [updated] = await tx
        .update(stores)
        .set(persistedLifecycleValues(next))
        .where(eq(stores.id, storeId))
        .returning(lifecycleSelection);

      return asSnapshot(updated);
    });
  }

  async startProvisioning(
    storeId: number,
    now = new Date()
  ): Promise<StoreLifecycleSnapshot> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [row] = await tx
        .select(lifecycleSelection)
        .from(stores)
        .where(and(eq(stores.id, storeId), isNull(stores.deletedAt)))
        .limit(1)
        .for("update");

      if (!row) {
        throw new StoreLifecycleRepositoryError(
          "NOT_FOUND",
          "Store not found"
        );
      }

      const current = asSnapshot(row);
      if (
        current.status === "provisioning" ||
        current.status === "provisioned"
      ) {
        return current;
      }

      const next = applyStoreLifecycleTransition(
        current,
        { to: "provisioning" },
        now
      );
      const [updated] = await tx
        .update(stores)
        .set(persistedLifecycleValues(next))
        .where(eq(stores.id, storeId))
        .returning(lifecycleSelection);

      return asSnapshot(updated);
    });
  }

  async markProvisioningFailed(
    storeId: number,
    errorCode: string,
    now = new Date()
  ): Promise<StoreLifecycleSnapshot> {
    assertSafeProvisioningErrorCode(errorCode);

    return getControlPlaneDb().transaction(async (tx) => {
      const [row] = await tx
        .select(lifecycleSelection)
        .from(stores)
        .where(and(eq(stores.id, storeId), isNull(stores.deletedAt)))
        .limit(1)
        .for("update");

      if (!row) {
        throw new StoreLifecycleRepositoryError(
          "NOT_FOUND",
          "Store not found"
        );
      }

      const current = asSnapshot(row);
      if (
        current.status === "provisioning_failed" &&
        current.lastProvisioningErrorCode === errorCode
      ) {
        return current;
      }

      const next = applyStoreLifecycleTransition(
        current,
        { to: "provisioning_failed", errorCode },
        now
      );
      const [updated] = await tx
        .update(stores)
        .set(persistedLifecycleValues(next))
        .where(eq(stores.id, storeId))
        .returning(lifecycleSelection);

      return asSnapshot(updated);
    });
  }

  async markProvisioned(
    storeId: number,
    tenantId: number,
    now = new Date()
  ): Promise<StoreLifecycleSnapshot> {
    assertTrustedTenantId(tenantId);

    return getControlPlaneDb().transaction(async (tx) => {
      const [row] = await tx
        .select({
          ...lifecycleSelection,
          slug: stores.slug,
        })
        .from(stores)
        .where(and(eq(stores.id, storeId), isNull(stores.deletedAt)))
        .limit(1)
        .for("update");

      if (!row) {
        throw new StoreLifecycleRepositoryError(
          "NOT_FOUND",
          "Store not found"
        );
      }

      const current = asSnapshot(row);
      if (current.status === "provisioned") {
        if (current.tenantId === tenantId) return current;
        throw new StoreLifecycleRepositoryError(
          "TENANT_MISMATCH",
          "Store is already bound to another Tenant"
        );
      }

      const [tenant] = await tx
        .select({
          id: controlPlaneTenants.id,
          slug: controlPlaneTenants.slug,
        })
        .from(controlPlaneTenants)
        .where(eq(controlPlaneTenants.id, tenantId))
        .limit(1);

      if (!tenant || tenant.slug !== row.slug) {
        throw new StoreLifecycleRepositoryError(
          "TENANT_MISMATCH",
          "Trusted Tenant does not match Store"
        );
      }

      const next = applyStoreLifecycleTransition(
        current,
        { to: "provisioned", tenantId },
        now
      );
      const [updated] = await tx
        .update(stores)
        .set(persistedLifecycleValues(next))
        .where(eq(stores.id, storeId))
        .returning(lifecycleSelection);

      return asSnapshot(updated);
    });
  }
}
