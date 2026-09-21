import {
  and,
  asc,
  eq,
  isNotNull,
  isNull,
  lte,
} from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/db";
import {
  controlPlaneTenants,
  organizationMemberships,
  stores,
} from "@/drizzle/control-plane-schema";
import { isStoreProvisioningLocked } from "@/lib/store-lifecycle/core";
import {
  MerchantStoreError,
  STORE_DELETE_UNDO_MS,
  nextStoreVersion,
  type DeleteStoreResult,
  type MerchantStore,
  type MerchantStoreRepository,
  type StoreProfile,
} from "./core";

const storeSelection = {
  id: stores.id,
  organizationId: stores.organizationId,
  displayName: stores.displayName,
  slug: stores.slug,
  status: stores.status,
  tenantId: stores.tenantId,
  deletedAt: stores.deletedAt,
  deleteFinalizesAt: stores.deleteFinalizesAt,
  slugReleasedAt: stores.slugReleasedAt,
  createdAt: stores.createdAt,
  updatedAt: stores.updatedAt,
};

function mapStore(row: {
  id: number;
  organizationId: number;
  displayName: string;
  slug: string;
  status: MerchantStore["status"];
  tenantId: number | null;
  deletedAt: Date | null;
  deleteFinalizesAt: Date | null;
  slugReleasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): MerchantStore {
  return {
    id: row.id,
    organizationId: row.organizationId,
    displayName: row.displayName,
    slug: row.slug,
    status: row.status,
    tenantId: row.tenantId,
    deletedAt: row.deletedAt,
    deleteFinalizesAt: row.deleteFinalizesAt,
    slugReleasedAt: row.slugReleasedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function isConstraintViolation(error: unknown, constraint: string) {
  const candidate = error as {
    code?: string;
    constraint?: string;
    cause?: unknown;
  };
  if (
    candidate?.code === "23505" &&
    candidate.constraint === constraint
  ) {
    return true;
  }
  const cause = candidate?.cause as
    | { code?: string; constraint?: string }
    | undefined;
  return cause?.code === "23505" && cause.constraint === constraint;
}

async function ownerOrganizationId(
  db: ReturnType<typeof getControlPlaneDb>,
  merchantId: number
) {
  const [membership] = await db
    .select({ organizationId: organizationMemberships.organizationId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.merchantAccountId, merchantId),
        eq(organizationMemberships.role, "owner")
      )
    )
    .orderBy(
      asc(organizationMemberships.createdAt),
      asc(organizationMemberships.organizationId)
    )
    .limit(1);

  return membership?.organizationId ?? null;
}

export class DrizzleMerchantStoreRepository
  implements MerchantStoreRepository
{
  async listForMerchant(merchantId: number): Promise<MerchantStore[]> {
    const db = getControlPlaneDb();
    const organizationId = await ownerOrganizationId(db, merchantId);
    if (organizationId === null) return [];

    const rows = await db
      .select(storeSelection)
      .from(stores)
      .where(
        and(
          eq(stores.organizationId, organizationId),
          isNull(stores.deletedAt)
        )
      )
      .orderBy(asc(stores.createdAt), asc(stores.id));

    return rows.map(mapStore);
  }

  async findOwnedById(
    merchantId: number,
    storeId: number
  ): Promise<MerchantStore | null> {
    const db = getControlPlaneDb();
    const organizationId = await ownerOrganizationId(db, merchantId);
    if (organizationId === null) return null;

    const [row] = await db
      .select(storeSelection)
      .from(stores)
      .where(
        and(
          eq(stores.id, storeId),
          eq(stores.organizationId, organizationId),
          isNull(stores.deletedAt)
        )
      )
      .limit(1);

    return row ? mapStore(row) : null;
  }

  async createDraftForMerchant(
    merchantId: number,
    profile: StoreProfile,
    now = new Date()
  ): Promise<MerchantStore> {
    try {
      return await getControlPlaneDb().transaction(async (tx) => {
        const [membership] = await tx
          .select({
            organizationId: organizationMemberships.organizationId,
          })
          .from(organizationMemberships)
          .where(
            and(
              eq(
                organizationMemberships.merchantAccountId,
                merchantId
              ),
              eq(organizationMemberships.role, "owner")
            )
          )
          .orderBy(
            asc(organizationMemberships.createdAt),
            asc(organizationMemberships.organizationId)
          )
          .limit(1);

        const organizationId = membership?.organizationId ?? null;
        if (organizationId === null) {
          throw new MerchantStoreError(
            "ORGANIZATION_REQUIRED",
            "Owner organization is required"
          );
        }

        const [tenant] = await tx
          .select({ id: controlPlaneTenants.id })
          .from(controlPlaneTenants)
          .where(eq(controlPlaneTenants.slug, profile.slug))
          .limit(1);

        if (tenant) {
          throw new MerchantStoreError(
            "SLUG_UNAVAILABLE",
            "Store slug already belongs to a Tenant"
          );
        }

        const [expiredReservation] = await tx
          .select(storeSelection)
          .from(stores)
          .where(
            and(
              eq(stores.slug, profile.slug),
              isNotNull(stores.deletedAt),
              isNull(stores.slugReleasedAt),
              lte(stores.deleteFinalizesAt, now)
            )
          )
          .limit(1)
          .for("update");

        if (expiredReservation) {
          await tx
            .update(stores)
            .set({
              slugReleasedAt: now,
              updatedAt: nextStoreVersion(
                expiredReservation.updatedAt,
                now
              ),
            })
            .where(eq(stores.id, expiredReservation.id));
        }

        const [created] = await tx
          .insert(stores)
          .values({
            organizationId,
            displayName: profile.displayName,
            slug: profile.slug,
            status: "draft",
            tenantId: null,
          })
          .returning();

        return mapStore(created);
      });
    } catch (error) {
      if (
        error instanceof MerchantStoreError ||
        !isConstraintViolation(
          error,
          "stores_slug_reserved_unique"
        )
      ) {
        throw error;
      }

      throw new MerchantStoreError(
        "SLUG_UNAVAILABLE",
        "Store slug is unavailable"
      );
    }
  }

  async updateOwned(
    merchantId: number,
    storeId: number,
    profile: StoreProfile,
    expectedUpdatedAt: Date,
    now = new Date()
  ): Promise<MerchantStore> {
    try {
      return await getControlPlaneDb().transaction(async (tx) => {
        const [membership] = await tx
          .select({
            organizationId: organizationMemberships.organizationId,
          })
          .from(organizationMemberships)
          .where(
            and(
              eq(
                organizationMemberships.merchantAccountId,
                merchantId
              ),
              eq(organizationMemberships.role, "owner")
            )
          )
          .orderBy(
            asc(organizationMemberships.createdAt),
            asc(organizationMemberships.organizationId)
          )
          .limit(1);

        const organizationId = membership?.organizationId ?? null;
        if (organizationId === null) {
          throw new MerchantStoreError(
            "NOT_FOUND",
            "Store not found"
          );
        }

        const [current] = await tx
          .select(storeSelection)
          .from(stores)
          .where(
            and(
              eq(stores.id, storeId),
              eq(stores.organizationId, organizationId),
              isNull(stores.deletedAt)
            )
          )
          .limit(1)
          .for("update");

        if (!current) {
          throw new MerchantStoreError(
            "NOT_FOUND",
            "Store not found"
          );
        }

        if (
          current.updatedAt.getTime() !==
          expectedUpdatedAt.getTime()
        ) {
          throw new MerchantStoreError(
            "CONFLICT",
            "Store changed"
          );
        }

        if (isStoreProvisioningLocked(current.status)) {
          throw new MerchantStoreError(
            "LIFECYCLE_LOCKED",
            "Store configuration is locked while activation or provisioning is in progress"
          );
        }

        const slugChanged = profile.slug !== current.slug;
        if (current.tenantId !== null && slugChanged) {
          throw new MerchantStoreError(
            "SLUG_LOCKED",
            "Store slug is locked"
          );
        }

        if (slugChanged) {
          const [tenant] = await tx
            .select({ id: controlPlaneTenants.id })
            .from(controlPlaneTenants)
            .where(eq(controlPlaneTenants.slug, profile.slug))
            .limit(1);

          if (tenant) {
            throw new MerchantStoreError(
              "SLUG_UNAVAILABLE",
              "Store slug already belongs to a Tenant"
            );
          }

          const [expiredReservation] = await tx
            .select(storeSelection)
            .from(stores)
            .where(
              and(
                eq(stores.slug, profile.slug),
                isNotNull(stores.deletedAt),
                isNull(stores.slugReleasedAt),
                lte(stores.deleteFinalizesAt, now)
              )
            )
            .limit(1)
            .for("update");

          if (expiredReservation) {
            await tx
              .update(stores)
              .set({
                slugReleasedAt: now,
                updatedAt: nextStoreVersion(
                  expiredReservation.updatedAt,
                  now
                ),
              })
              .where(eq(stores.id, expiredReservation.id));
          }
        }

        const updatedAt = nextStoreVersion(current.updatedAt, now);
        const [updated] = await tx
          .update(stores)
          .set({
            displayName: profile.displayName,
            slug:
              current.tenantId === null
                ? profile.slug
                : current.slug,
            updatedAt,
          })
          .where(eq(stores.id, current.id))
          .returning();

        return mapStore(updated);
      });
    } catch (error) {
      if (
        error instanceof MerchantStoreError ||
        !isConstraintViolation(
          error,
          "stores_slug_reserved_unique"
        )
      ) {
        throw error;
      }

      throw new MerchantStoreError(
        "SLUG_UNAVAILABLE",
        "Store slug is unavailable"
      );
    }
  }

  async isSlugAvailable(
    merchantId: number,
    slug: string,
    currentStoreId?: number,
    now = new Date()
  ): Promise<boolean> {
    const db = getControlPlaneDb();
    const organizationId = await ownerOrganizationId(db, merchantId);
    if (organizationId === null) return false;

    if (currentStoreId !== undefined) {
      const [currentStore] = await db
        .select({ id: stores.id })
        .from(stores)
        .where(
          and(
            eq(stores.id, currentStoreId),
            eq(stores.organizationId, organizationId),
            isNull(stores.deletedAt)
          )
        )
        .limit(1);

      if (!currentStore) return false;
    }

    const [tenant] = await db
      .select({ id: controlPlaneTenants.id })
      .from(controlPlaneTenants)
      .where(eq(controlPlaneTenants.slug, slug))
      .limit(1);

    if (tenant) return false;

    const [reserved] = await db
      .select({
        id: stores.id,
        deletedAt: stores.deletedAt,
        deleteFinalizesAt: stores.deleteFinalizesAt,
      })
      .from(stores)
      .where(
        and(
          eq(stores.slug, slug),
          isNull(stores.slugReleasedAt)
        )
      )
      .limit(1);

    if (!reserved) return true;
    if (
      currentStoreId !== undefined &&
      reserved.id === currentStoreId
    ) {
      return true;
    }

    return Boolean(
      reserved.deletedAt &&
      reserved.deleteFinalizesAt &&
      reserved.deleteFinalizesAt.getTime() <= now.getTime()
    );
  }

  async softDeleteOwned(
    merchantId: number,
    storeId: number,
    expectedUpdatedAt: Date,
    now = new Date()
  ): Promise<DeleteStoreResult> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [membership] = await tx
        .select({
          organizationId: organizationMemberships.organizationId,
        })
        .from(organizationMemberships)
        .where(
          and(
            eq(
              organizationMemberships.merchantAccountId,
              merchantId
            ),
            eq(organizationMemberships.role, "owner")
          )
        )
        .orderBy(
          asc(organizationMemberships.createdAt),
          asc(organizationMemberships.organizationId)
        )
        .limit(1);

      const organizationId = membership?.organizationId ?? null;
      if (organizationId === null) {
        throw new MerchantStoreError(
          "NOT_FOUND",
          "Store not found"
        );
      }

      const [current] = await tx
        .select(storeSelection)
        .from(stores)
        .where(
          and(
            eq(stores.id, storeId),
            eq(stores.organizationId, organizationId),
            isNull(stores.deletedAt)
          )
        )
        .limit(1)
        .for("update");

      if (!current) {
        throw new MerchantStoreError(
          "NOT_FOUND",
          "Store not found"
        );
      }

      if (
        current.updatedAt.getTime() !==
        expectedUpdatedAt.getTime()
      ) {
        throw new MerchantStoreError(
          "CONFLICT",
          "Store changed"
        );
      }

      if (isStoreProvisioningLocked(current.status)) {
        throw new MerchantStoreError(
          "LIFECYCLE_LOCKED",
          "Store cannot be deleted while activation or provisioning is in progress"
        );
      }

      if (current.tenantId !== null) {
        throw new MerchantStoreError(
          "TENANT_LINKED",
          "Provisioned Store cannot be deleted"
        );
      }

      const updatedAt = nextStoreVersion(current.updatedAt, now);
      const deleteFinalizesAt = new Date(
        now.getTime() + STORE_DELETE_UNDO_MS
      );

      const [deleted] = await tx
        .update(stores)
        .set({
          deletedAt: now,
          deleteFinalizesAt,
          updatedAt,
        })
        .where(eq(stores.id, current.id))
        .returning();

      return {
        store: mapStore(deleted),
        undoVersion: deleted.updatedAt.toISOString(),
        undoExpiresAt: deleteFinalizesAt.toISOString(),
      };
    });
  }

  async undoDeleteOwned(
    merchantId: number,
    storeId: number,
    expectedUpdatedAt: Date,
    now = new Date()
  ): Promise<MerchantStore> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [membership] = await tx
        .select({
          organizationId: organizationMemberships.organizationId,
        })
        .from(organizationMemberships)
        .where(
          and(
            eq(
              organizationMemberships.merchantAccountId,
              merchantId
            ),
            eq(organizationMemberships.role, "owner")
          )
        )
        .orderBy(
          asc(organizationMemberships.createdAt),
          asc(organizationMemberships.organizationId)
        )
        .limit(1);

      const organizationId = membership?.organizationId ?? null;
      if (organizationId === null) {
        throw new MerchantStoreError(
          "NOT_FOUND",
          "Store not found"
        );
      }

      const [current] = await tx
        .select(storeSelection)
        .from(stores)
        .where(
          and(
            eq(stores.id, storeId),
            eq(stores.organizationId, organizationId)
          )
        )
        .limit(1)
        .for("update");

      if (!current || current.deletedAt === null) {
        throw new MerchantStoreError(
          "NOT_FOUND",
          "Deleted Store not found"
        );
      }

      if (
        current.updatedAt.getTime() !==
        expectedUpdatedAt.getTime()
      ) {
        throw new MerchantStoreError(
          "CONFLICT",
          "Store changed"
        );
      }

      if (
        current.slugReleasedAt !== null ||
        current.deleteFinalizesAt === null ||
        current.deleteFinalizesAt.getTime() <= now.getTime()
      ) {
        throw new MerchantStoreError(
          "UNDO_EXPIRED",
          "Undo window expired"
        );
      }

      const updatedAt = nextStoreVersion(current.updatedAt, now);
      const [restored] = await tx
        .update(stores)
        .set({
          deletedAt: null,
          deleteFinalizesAt: null,
          updatedAt,
        })
        .where(eq(stores.id, current.id))
        .returning();

      return mapStore(restored);
    });
  }
}
