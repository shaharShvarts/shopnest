import "server-only";

import {
  and,
  desc,
  eq,
  isNotNull,
  isNull,
  lte,
} from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/control-db";
import {
  organizationMemberships,
  storeDomainClaims,
  stores,
} from "@/drizzle/control-plane-schema";
import type {
  StoreDomainClaimRecord,
  StoreDomainClaimRepository,
} from "./core";

const selection = {
  id: storeDomainClaims.id,
  storeId: storeDomainClaims.storeId,
  hostname: storeDomainClaims.hostname,
  status: storeDomainClaims.status,
  verificationTokenHash: storeDomainClaims.verificationTokenHash,
  expiresAt: storeDomainClaims.expiresAt,
  verifiedAt: storeDomainClaims.verifiedAt,
  consumedAt: storeDomainClaims.consumedAt,
};

type ClaimSelectionRow = {
  id: number;
  storeId: number;
  hostname: string;
  status: StoreDomainClaimRecord["status"];
  verificationTokenHash: string;
  expiresAt: Date;
  verifiedAt: Date | null;
  consumedAt: Date | null;
};

function mapClaim(row: ClaimSelectionRow): StoreDomainClaimRecord {
  return row;
}

function ownedProvisionedStoreWhere(
  merchantId: number,
  storeId: number
) {
  return and(
    eq(stores.id, storeId),
    eq(stores.status, "provisioned"),
    isNotNull(stores.tenantId),
    isNull(stores.deletedAt),
    eq(
      organizationMemberships.organizationId,
      stores.organizationId
    ),
    eq(
      organizationMemberships.merchantAccountId,
      merchantId
    ),
    eq(organizationMemberships.role, "owner")
  );
}

export class DrizzleStoreDomainClaimRepository
  implements StoreDomainClaimRepository
{
  async createPendingForOwnedProvisionedStore(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
    verificationTokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<StoreDomainClaimRecord | null> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [ownedStore] = await tx
        .select({ id: stores.id })
        .from(stores)
        .innerJoin(
          organizationMemberships,
          eq(
            organizationMemberships.organizationId,
            stores.organizationId
          )
        )
        .where(
          ownedProvisionedStoreWhere(
            input.merchantId,
            input.storeId
          )
        )
        .limit(1)
        .for("update");

      if (!ownedStore) return null;

      await tx
        .update(storeDomainClaims)
        .set({
          status: "expired",
          updatedAt: input.now,
        })
        .where(
          and(
            eq(storeDomainClaims.storeId, input.storeId),
            eq(storeDomainClaims.hostname, input.hostname),
            eq(storeDomainClaims.status, "pending_verification"),
            lte(storeDomainClaims.expiresAt, input.now)
          )
        );

      await tx
        .update(storeDomainClaims)
        .set({
          status: "cancelled",
          updatedAt: input.now,
        })
        .where(
          and(
            eq(storeDomainClaims.storeId, input.storeId),
            eq(storeDomainClaims.hostname, input.hostname),
            eq(storeDomainClaims.status, "pending_verification")
          )
        );

      const [created] = await tx
        .insert(storeDomainClaims)
        .values({
          storeId: input.storeId,
          hostname: input.hostname,
          status: "pending_verification",
          verificationTokenHash: input.verificationTokenHash,
          expiresAt: input.expiresAt,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning(selection);

      return mapClaim(created);
    });
  }

  async findPendingForOwnedStore(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
  }): Promise<StoreDomainClaimRecord | null> {
    const [row] = await getControlPlaneDb()
      .select(selection)
      .from(storeDomainClaims)
      .innerJoin(
        stores,
        eq(stores.id, storeDomainClaims.storeId)
      )
      .innerJoin(
        organizationMemberships,
        eq(
          organizationMemberships.organizationId,
          stores.organizationId
        )
      )
      .where(
        and(
          ownedProvisionedStoreWhere(
            input.merchantId,
            input.storeId
          ),
          eq(storeDomainClaims.hostname, input.hostname),
          eq(storeDomainClaims.status, "pending_verification")
        )
      )
      .orderBy(desc(storeDomainClaims.createdAt))
      .limit(1);

    return row ? mapClaim(row) : null;
  }

  async markExpired(id: number, now: Date): Promise<void> {
    await getControlPlaneDb()
      .update(storeDomainClaims)
      .set({ status: "expired", updatedAt: now })
      .where(
        and(
          eq(storeDomainClaims.id, id),
          eq(storeDomainClaims.status, "pending_verification")
        )
      );
  }

  async markVerified(input: {
    id: number;
    expectedTokenHash: string;
    now: Date;
  }): Promise<StoreDomainClaimRecord | null> {
    const [updated] = await getControlPlaneDb()
      .update(storeDomainClaims)
      .set({
        status: "verified",
        verifiedAt: input.now,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(storeDomainClaims.id, input.id),
          eq(storeDomainClaims.status, "pending_verification"),
          eq(
            storeDomainClaims.verificationTokenHash,
            input.expectedTokenHash
          )
        )
      )
      .returning(selection);

    return updated ? mapClaim(updated) : null;
  }
}
