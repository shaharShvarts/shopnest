import "server-only";

import {
  and,
  desc,
  eq,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/control-db";
import {
  organizationMemberships,
  plans,
  storeDomainClaims,
  stores,
  subscriptions,
} from "@/drizzle/control-plane-schema";
import type {
  ClaimCheckReservation,
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
  cnameVerifiedAt: storeDomainClaims.cnameVerifiedAt,
  lastTxtCheckAt: storeDomainClaims.lastTxtCheckAt,
  lastCnameCheckAt: storeDomainClaims.lastCnameCheckAt,
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
  cnameVerifiedAt: Date | null;
  lastTxtCheckAt: Date | null;
  lastCnameCheckAt: Date | null;
  consumedAt: Date | null;
};

function mapClaim(row: ClaimSelectionRow): StoreDomainClaimRecord {
  return row;
}

function entitledOwnedStoreWhere(
  merchantId: number,
  storeId: number
) {
  return and(
    eq(stores.id, storeId),
    isNull(stores.deletedAt),
    eq(plans.status, "active"),
    sql`${plans.code} IN ('medium', 'large')`,
    sql`${subscriptions.status} IN ('pending', 'trialing', 'active')`,
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
  async createPendingForOwnedStore(input: {
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
        .innerJoin(
          subscriptions,
          and(
            eq(subscriptions.storeId, stores.id),
            eq(subscriptions.organizationId, stores.organizationId)
          )
        )
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(
          entitledOwnedStoreWhere(
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
      .innerJoin(
        subscriptions,
        and(
          eq(subscriptions.storeId, stores.id),
          eq(subscriptions.organizationId, stores.organizationId)
        )
      )
      .innerJoin(plans, eq(plans.id, subscriptions.planId))
      .where(
        and(
          entitledOwnedStoreWhere(
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

  async reserveTxtCheck(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
    now: Date;
    cooldownMs: number;
  }): Promise<ClaimCheckReservation> {
    return this.reserveCheck({
      ...input,
      kind: "txt",
    });
  }

  async reserveCnameCheck(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
    now: Date;
    cooldownMs: number;
  }): Promise<ClaimCheckReservation> {
    return this.reserveCheck({
      ...input,
      kind: "cname",
    });
  }

  private async reserveCheck(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
    now: Date;
    cooldownMs: number;
    kind: "txt" | "cname";
  }): Promise<ClaimCheckReservation> {
    return getControlPlaneDb().transaction(async (tx) => {
      const allowedStatuses =
        input.kind === "txt"
          ? sql`${storeDomainClaims.status} = 'pending_verification'`
          : sql`${storeDomainClaims.status} = 'verified'`;

      const [row] = await tx
        .select(selection)
        .from(storeDomainClaims)
        .innerJoin(stores, eq(stores.id, storeDomainClaims.storeId))
        .innerJoin(
          organizationMemberships,
          eq(
            organizationMemberships.organizationId,
            stores.organizationId
          )
        )
        .innerJoin(
          subscriptions,
          and(
            eq(subscriptions.storeId, stores.id),
            eq(subscriptions.organizationId, stores.organizationId)
          )
        )
        .innerJoin(plans, eq(plans.id, subscriptions.planId))
        .where(
          and(
            entitledOwnedStoreWhere(input.merchantId, input.storeId),
            eq(storeDomainClaims.hostname, input.hostname),
            allowedStatuses
          )
        )
        .orderBy(desc(storeDomainClaims.createdAt))
        .limit(1)
        .for("update");

      if (!row) {
        if (input.kind === "cname") {
          const [unverified] = await tx
            .select(selection)
            .from(storeDomainClaims)
            .innerJoin(stores, eq(stores.id, storeDomainClaims.storeId))
            .innerJoin(
              organizationMemberships,
              eq(
                organizationMemberships.organizationId,
                stores.organizationId
              )
            )
            .innerJoin(
              subscriptions,
              and(
                eq(subscriptions.storeId, stores.id),
                eq(subscriptions.organizationId, stores.organizationId)
              )
            )
            .innerJoin(plans, eq(plans.id, subscriptions.planId))
            .where(
              and(
                entitledOwnedStoreWhere(input.merchantId, input.storeId),
                eq(storeDomainClaims.hostname, input.hostname),
                eq(storeDomainClaims.status, "pending_verification")
              )
            )
            .orderBy(desc(storeDomainClaims.createdAt))
            .limit(1)
            .for("update");
          if (unverified) {
            return { kind: "not_verified", claim: mapClaim(unverified) };
          }
        }
        return { kind: "not_found" };
      }

      const claim = mapClaim(row);
      if (claim.expiresAt.getTime() <= input.now.getTime()) {
        await tx
          .update(storeDomainClaims)
          .set({ status: "expired", updatedAt: input.now })
          .where(eq(storeDomainClaims.id, claim.id));
        return {
          kind: "expired",
          claim: { ...claim, status: "expired" },
        };
      }

      const lastCheck =
        input.kind === "txt" ? claim.lastTxtCheckAt : claim.lastCnameCheckAt;
      const nextAllowedAt = lastCheck
        ? new Date(lastCheck.getTime() + input.cooldownMs)
        : null;

      if (nextAllowedAt && nextAllowedAt.getTime() > input.now.getTime()) {
        return { kind: "cooldown", claim, nextAllowedAt };
      }

      const values =
        input.kind === "txt"
          ? { lastTxtCheckAt: input.now, updatedAt: input.now }
          : { lastCnameCheckAt: input.now, updatedAt: input.now };

      const [updated] = await tx
        .update(storeDomainClaims)
        .set(values)
        .where(eq(storeDomainClaims.id, claim.id))
        .returning(selection);

      return { kind: "ready", claim: mapClaim(updated) };
    });
  }

  async markExpired(id: number, now: Date): Promise<void> {
    await getControlPlaneDb()
      .update(storeDomainClaims)
      .set({ status: "expired", updatedAt: now })
      .where(eq(storeDomainClaims.id, id));
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

  async markCnameVerified(input: {
    id: number;
    now: Date;
  }): Promise<StoreDomainClaimRecord | null> {
    const [updated] = await getControlPlaneDb()
      .update(storeDomainClaims)
      .set({
        cnameVerifiedAt: input.now,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(storeDomainClaims.id, input.id),
          eq(storeDomainClaims.status, "verified")
        )
      )
      .returning(selection);

    return updated ? mapClaim(updated) : null;
  }
}
