import { and, eq, isNull, or } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/control-db";
import {
  controlPlaneTenants,
  plans,
  stores,
  subscriptions,
} from "@/drizzle/control-plane-schema";
import { validateStoreSlug } from "@/lib/merchant-stores/core";
import {
  applyStoreLifecycleTransition,
  type StoreLifecycleSnapshot,
} from "@/lib/store-lifecycle/core";
import {
  ActivationOrchestrationError,
  asProvisionableTenantPlan,
  tenantSchemaNameForStore,
  type ProvisionableTenantPlan,
} from "./core";

export type ActivationProvisioningContext = {
  storeId: number;
  organizationId: number;
  displayName: string;
  slug: string;
  schemaName: string;
  subscriptionId: number;
  plan: ProvisionableTenantPlan;
};

export type ActivationFinalization = {
  storeId: number;
  tenantId: number;
  slug: string;
  schemaName: string;
};

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

function asLifecycleSnapshot(row: {
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

function isUniqueViolation(error: unknown) {
  const candidate = error as {
    code?: string;
    cause?: { code?: string };
  };
  return candidate?.code === "23505" || candidate?.cause?.code === "23505";
}

function isAllowedPreProvisioningSubscriptionStatus(status: string) {
  return status === "pending" || status === "trialing" || status === "active";
}

export interface ActivationOrchestrationRepository {
  loadProvisioningContext(storeId: number): Promise<ActivationProvisioningContext>;
  finalizeProvisioning(
    context: ActivationProvisioningContext,
    now?: Date
  ): Promise<ActivationFinalization>;
}

export class DrizzleActivationOrchestrationRepository
  implements ActivationOrchestrationRepository
{
  async loadProvisioningContext(
    storeId: number
  ): Promise<ActivationProvisioningContext> {
    const db = getControlPlaneDb();

    const [store] = await db
      .select({
        id: stores.id,
        organizationId: stores.organizationId,
        displayName: stores.displayName,
        slug: stores.slug,
        status: stores.status,
        tenantId: stores.tenantId,
      })
      .from(stores)
      .where(and(eq(stores.id, storeId), isNull(stores.deletedAt)))
      .limit(1);

    if (!store) {
      throw new ActivationOrchestrationError(
        "STORE_NOT_FOUND",
        "Store not found"
      );
    }

    if (store.status !== "provisioning" || store.tenantId !== null) {
      throw new ActivationOrchestrationError(
        "TENANT_FINALIZATION_FAILED",
        "Store is not in a provisionable lifecycle state"
      );
    }

    const slugValidation = validateStoreSlug(store.slug);
    if (!slugValidation.ok || slugValidation.slug !== store.slug) {
      throw new ActivationOrchestrationError(
        "INVALID_STORE_SLUG",
        "Store slug is not canonical"
      );
    }

    const schemaName = tenantSchemaNameForStore(store.id);

    const [conflictingTenant] = await db
      .select({
        id: controlPlaneTenants.id,
        slug: controlPlaneTenants.slug,
        schemaName: controlPlaneTenants.schemaName,
      })
      .from(controlPlaneTenants)
      .where(
        or(
          eq(controlPlaneTenants.slug, store.slug),
          eq(controlPlaneTenants.schemaName, schemaName)
        )
      )
      .limit(1);

    if (conflictingTenant) {
      throw new ActivationOrchestrationError(
        "TENANT_IDENTITY_CONFLICT",
        "Tenant identity is already reserved"
      );
    }

    const [subscription] = await db
      .select({
        id: subscriptions.id,
        organizationId: subscriptions.organizationId,
        storeId: subscriptions.storeId,
        tenantId: subscriptions.tenantId,
        status: subscriptions.status,
        planCode: plans.code,
        planStatus: plans.status,
      })
      .from(subscriptions)
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(
        and(
          eq(subscriptions.storeId, store.id),
          eq(subscriptions.organizationId, store.organizationId)
        )
      )
      .limit(1);

    if (
      !subscription ||
      subscription.storeId !== store.id ||
      subscription.organizationId !== store.organizationId ||
      subscription.tenantId !== null ||
      !isAllowedPreProvisioningSubscriptionStatus(subscription.status) ||
      subscription.planStatus !== "active"
    ) {
      throw new ActivationOrchestrationError(
        "TENANT_FINALIZATION_FAILED",
        "Store subscription is not provisionable"
      );
    }

    const plan = asProvisionableTenantPlan(subscription.planCode);
    if (!plan) {
      throw new ActivationOrchestrationError(
        "PLAN_NOT_PROVISIONABLE",
        "Selected plan is not provisionable by the current Tenant runtime"
      );
    }

    return {
      storeId: store.id,
      organizationId: store.organizationId,
      displayName: store.displayName,
      slug: store.slug,
      schemaName,
      subscriptionId: subscription.id,
      plan,
    };
  }

  async finalizeProvisioning(
    context: ActivationProvisioningContext,
    now = new Date()
  ): Promise<ActivationFinalization> {
    try {
      return await getControlPlaneDb().transaction(async (tx) => {
        const [row] = await tx
          .select({
            ...lifecycleSelection,
            displayName: stores.displayName,
            slug: stores.slug,
          })
          .from(stores)
          .where(
            and(eq(stores.id, context.storeId), isNull(stores.deletedAt))
          )
          .limit(1)
          .for("update");

        if (!row) {
          throw new ActivationOrchestrationError(
            "STORE_NOT_FOUND",
            "Store not found"
          );
        }

        if (row.status === "provisioned" && row.tenantId !== null) {
          const [existingTenant] = await tx
            .select({
              id: controlPlaneTenants.id,
              slug: controlPlaneTenants.slug,
              schemaName: controlPlaneTenants.schemaName,
            })
            .from(controlPlaneTenants)
            .where(eq(controlPlaneTenants.id, row.tenantId))
            .limit(1);

          if (
            existingTenant?.slug === context.slug &&
            existingTenant.schemaName === context.schemaName
          ) {
            return {
              storeId: row.storeId,
              tenantId: existingTenant.id,
              slug: existingTenant.slug,
              schemaName: existingTenant.schemaName,
            };
          }

          throw new ActivationOrchestrationError(
            "TENANT_IDENTITY_CONFLICT",
            "Provisioned Store is bound to another Tenant identity"
          );
        }

        if (
          row.status !== "provisioning" ||
          row.tenantId !== null ||
          row.organizationId !== context.organizationId ||
          row.slug !== context.slug ||
          row.displayName !== context.displayName
        ) {
          throw new ActivationOrchestrationError(
            "TENANT_FINALIZATION_FAILED",
            "Store changed during provisioning"
          );
        }

        const [subscription] = await tx
          .select({
            id: subscriptions.id,
            organizationId: subscriptions.organizationId,
            storeId: subscriptions.storeId,
            tenantId: subscriptions.tenantId,
            status: subscriptions.status,
            planCode: plans.code,
            planStatus: plans.status,
          })
          .from(subscriptions)
          .innerJoin(plans, eq(plans.id, subscriptions.planId))
          .where(eq(subscriptions.id, context.subscriptionId))
          .limit(1)
          .for("update");

        const currentPlan = subscription
          ? asProvisionableTenantPlan(subscription.planCode)
          : null;

        if (
          !subscription ||
          subscription.organizationId !== context.organizationId ||
          subscription.storeId !== context.storeId ||
          subscription.tenantId !== null ||
          !isAllowedPreProvisioningSubscriptionStatus(subscription.status) ||
          subscription.planStatus !== "active" ||
          currentPlan !== context.plan
        ) {
          throw new ActivationOrchestrationError(
            currentPlan === null
              ? "PLAN_NOT_PROVISIONABLE"
              : "TENANT_FINALIZATION_FAILED",
            "Subscription changed during provisioning"
          );
        }

        const [conflictingTenant] = await tx
          .select({
            id: controlPlaneTenants.id,
            slug: controlPlaneTenants.slug,
            schemaName: controlPlaneTenants.schemaName,
          })
          .from(controlPlaneTenants)
          .where(
            or(
              eq(controlPlaneTenants.slug, context.slug),
              eq(controlPlaneTenants.schemaName, context.schemaName)
            )
          )
          .limit(1);

        if (conflictingTenant) {
          throw new ActivationOrchestrationError(
            "TENANT_IDENTITY_CONFLICT",
            "Tenant identity became unavailable"
          );
        }

        const [tenant] = await tx
          .insert(controlPlaneTenants)
          .values({
            slug: context.slug,
            schemaName: context.schemaName,
            displayName: context.displayName,
            status: "active",
            plan: context.plan,
            createdAt: now,
            updatedAt: now,
          })
          .returning({
            id: controlPlaneTenants.id,
            slug: controlPlaneTenants.slug,
            schemaName: controlPlaneTenants.schemaName,
          });

        if (!tenant) {
          throw new ActivationOrchestrationError(
            "TENANT_FINALIZATION_FAILED",
            "Tenant finalization did not create a registry row"
          );
        }

        const [boundSubscription] = await tx
          .update(subscriptions)
          .set({
            tenantId: tenant.id,
            updatedAt: now,
          })
          .where(
            and(
              eq(subscriptions.id, subscription.id),
              isNull(subscriptions.tenantId)
            )
          )
          .returning({ id: subscriptions.id });

        if (!boundSubscription) {
          throw new ActivationOrchestrationError(
            "TENANT_FINALIZATION_FAILED",
            "Subscription could not be bound to Tenant"
          );
        }

        const next = applyStoreLifecycleTransition(
          asLifecycleSnapshot(row),
          { to: "provisioned", tenantId: tenant.id },
          now
        );

        const [updatedStore] = await tx
          .update(stores)
          .set(persistedLifecycleValues(next))
          .where(
            and(
              eq(stores.id, context.storeId),
              eq(stores.status, "provisioning"),
              isNull(stores.tenantId)
            )
          )
          .returning({ id: stores.id });

        if (!updatedStore) {
          throw new ActivationOrchestrationError(
            "TENANT_FINALIZATION_FAILED",
            "Store could not be bound to Tenant"
          );
        }

        return {
          storeId: context.storeId,
          tenantId: tenant.id,
          slug: tenant.slug,
          schemaName: tenant.schemaName,
        };
      });
    } catch (error) {
      if (error instanceof ActivationOrchestrationError) throw error;

      if (isUniqueViolation(error)) {
        throw new ActivationOrchestrationError(
          "TENANT_IDENTITY_CONFLICT",
          "Tenant identity is already reserved"
        );
      }

      throw new ActivationOrchestrationError(
        "TENANT_FINALIZATION_FAILED",
        "Tenant finalization failed"
      );
    }
  }
}
