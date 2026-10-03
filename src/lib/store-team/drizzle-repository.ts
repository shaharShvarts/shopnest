import "server-only";

import { and, count, eq, isNull, sql } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/db";
import {
  adminUsers,
  adminUserTenants,
  entitlements,
  planEntitlements,
  plans,
  storeManagerAssignments,
  storeManagerInvitations,
  stores,
  subscriptions,
} from "@/drizzle/control-plane-schema";
import { hashAdminPassword } from "@/lib/admin-auth/password.mjs";
import {
  assertManagerCapacity,
  normalizeManagerEmail,
  STORE_MANAGERS_ENTITLEMENT,
  StoreTeamError,
  storeManagerQuota,
  type StoreManager,
  type StoreManagerInvitationState,
  type StoreManagerQuota,
} from "./core";

async function managerLimit(
  tx: Parameters<Parameters<ReturnType<typeof getControlPlaneDb>["transaction"]>[0]>[0],
  storeId: number
) {
  const [row] = await tx
    .select({ value: planEntitlements.value })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .innerJoin(planEntitlements, eq(planEntitlements.planId, plans.id))
    .innerJoin(entitlements, eq(entitlements.id, planEntitlements.entitlementId))
    .where(
      and(
        eq(subscriptions.storeId, storeId),
        eq(entitlements.code, STORE_MANAGERS_ENTITLEMENT)
      )
    )
    .limit(1);

  return row?.value ?? 0;
}

async function managerUsage(
  tx: Parameters<Parameters<ReturnType<typeof getControlPlaneDb>["transaction"]>[0]>[0],
  storeId: number
) {
  const [row] = await tx
    .select({ value: count(storeManagerAssignments.adminUserId) })
    .from(storeManagerAssignments)
    .where(eq(storeManagerAssignments.storeId, storeId));
  return Number(row?.value ?? 0);
}

async function lockStoreManagerQuota(
  tx: Parameters<Parameters<ReturnType<typeof getControlPlaneDb>["transaction"]>[0]>[0],
  storeId: number
) {
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${"shopnest:store-manager:" + storeId}))`
  );
  const [used, limit] = await Promise.all([
    managerUsage(tx, storeId),
    managerLimit(tx, storeId),
  ]);
  assertManagerCapacity(used, limit);
  return { used, limit };
}

async function assertEligibleExistingManager(
  tx: Parameters<Parameters<ReturnType<typeof getControlPlaneDb>["transaction"]>[0]>[0],
  manager: {
    id: number;
    email: string;
    isActive: boolean;
    role: "super_admin" | "tenant_admin";
    createdAt: Date;
  }
) {
  if (!manager.isActive || manager.role !== "tenant_admin") {
    throw new StoreTeamError(
      "INVALID_MANAGER_ACCOUNT",
      "Account cannot be used as a Store Manager"
    );
  }

  const [legacyTenant] = await tx
    .select({ adminUserId: adminUserTenants.adminUserId })
    .from(adminUserTenants)
    .where(eq(adminUserTenants.adminUserId, manager.id))
    .limit(1);

  if (legacyTenant) {
    throw new StoreTeamError(
      "INVALID_MANAGER_ACCOUNT",
      "Legacy tenant administrators cannot be assigned as Store Managers"
    );
  }
}

export class DrizzleStoreTeamRepository {
  async list(storeId: number): Promise<StoreManager[]> {
    const rows = await getControlPlaneDb()
      .select({
        adminUserId: adminUsers.id,
        email: adminUsers.email,
        isActive: adminUsers.isActive,
        createdAt: storeManagerAssignments.createdAt,
      })
      .from(storeManagerAssignments)
      .innerJoin(adminUsers, eq(adminUsers.id, storeManagerAssignments.adminUserId))
      .where(eq(storeManagerAssignments.storeId, storeId))
      .orderBy(adminUsers.email);

    return rows;
  }

  async quota(storeId: number): Promise<StoreManagerQuota> {
    const db = getControlPlaneDb();
    const [used, limit] = await Promise.all([
      managerUsage(db as never, storeId),
      managerLimit(db as never, storeId),
    ]);
    return storeManagerQuota(used, limit);
  }

  async inviteOrAssign(input: {
    storeId: number;
    email: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }): Promise<
    | { kind: "assigned_existing"; manager: StoreManager }
    | { kind: "invitation_issued"; email: string }
  > {
    const normalizedEmail = normalizeManagerEmail(input.email);

    return getControlPlaneDb().transaction(async (tx) => {
      await lockStoreManagerQuota(tx, input.storeId);

      const [manager] = await tx
        .select({
          id: adminUsers.id,
          email: adminUsers.email,
          isActive: adminUsers.isActive,
          role: adminUsers.role,
          createdAt: adminUsers.createdAt,
        })
        .from(adminUsers)
        .where(eq(adminUsers.email, normalizedEmail))
        .limit(1);

      if (manager) {
        await assertEligibleExistingManager(tx, manager);

        const [alreadyAssigned] = await tx
          .select({ adminUserId: storeManagerAssignments.adminUserId })
          .from(storeManagerAssignments)
          .where(
            and(
              eq(storeManagerAssignments.storeId, input.storeId),
              eq(storeManagerAssignments.adminUserId, manager.id)
            )
          )
          .limit(1);

        if (alreadyAssigned) {
          throw new StoreTeamError(
            "MANAGER_ALREADY_ASSIGNED",
            "Manager is already assigned to this Store"
          );
        }

        const [assignment] = await tx
          .insert(storeManagerAssignments)
          .values({ storeId: input.storeId, adminUserId: manager.id })
          .returning({ createdAt: storeManagerAssignments.createdAt });

        return {
          kind: "assigned_existing" as const,
          manager: {
            adminUserId: manager.id,
            email: manager.email,
            isActive: manager.isActive,
            createdAt: assignment?.createdAt ?? manager.createdAt,
          },
        };
      }

      await tx.insert(storeManagerInvitations).values({
        storeId: input.storeId,
        email: normalizedEmail,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        consumedAt: null,
        createdAt: input.now,
      });

      return {
        kind: "invitation_issued" as const,
        email: normalizedEmail,
      };
    });
  }

  async deleteInvitationByTokenHash(tokenHash: string) {
    await getControlPlaneDb()
      .delete(storeManagerInvitations)
      .where(eq(storeManagerInvitations.tokenHash, tokenHash));
  }

  async inspectInvitation(
    tokenHash: string,
    now: Date
  ): Promise<StoreManagerInvitationState> {
    const [row] = await getControlPlaneDb()
      .select({
        email: storeManagerInvitations.email,
        expiresAt: storeManagerInvitations.expiresAt,
        consumedAt: storeManagerInvitations.consumedAt,
        storeName: stores.displayName,
      })
      .from(storeManagerInvitations)
      .innerJoin(stores, eq(stores.id, storeManagerInvitations.storeId))
      .where(eq(storeManagerInvitations.tokenHash, tokenHash))
      .limit(1);

    if (!row) return { kind: "invalid" };
    if (row.consumedAt) {
      return {
        kind: "completed",
        email: row.email,
        storeName: row.storeName,
      };
    }
    if (row.expiresAt.getTime() <= now.getTime()) {
      return {
        kind: "expired",
        email: row.email,
        storeName: row.storeName,
      };
    }
    return {
      kind: "pending",
      email: row.email,
      storeName: row.storeName,
      expiresAt: row.expiresAt,
    };
  }

  async completeInvitation(input: {
    tokenHash: string;
    password: string;
    now: Date;
  }): Promise<{ adminUserId: number; email: string }> {
    const passwordHash = await hashAdminPassword(input.password);

    return getControlPlaneDb().transaction(async (tx) => {
      const [invitation] = await tx
        .select({
          id: storeManagerInvitations.id,
          storeId: storeManagerInvitations.storeId,
          email: storeManagerInvitations.email,
          expiresAt: storeManagerInvitations.expiresAt,
          consumedAt: storeManagerInvitations.consumedAt,
        })
        .from(storeManagerInvitations)
        .where(eq(storeManagerInvitations.tokenHash, input.tokenHash))
        .limit(1)
        .for("update");

      if (!invitation || invitation.consumedAt) {
        throw new StoreTeamError("INVITATION_INVALID", "Invitation is unavailable");
      }
      if (invitation.expiresAt.getTime() <= input.now.getTime()) {
        throw new StoreTeamError("INVITATION_EXPIRED", "Invitation has expired");
      }

      const [existing] = await tx
        .select({
          id: adminUsers.id,
          email: adminUsers.email,
          isActive: adminUsers.isActive,
          role: adminUsers.role,
          createdAt: adminUsers.createdAt,
        })
        .from(adminUsers)
        .where(eq(adminUsers.email, invitation.email))
        .limit(1);

      if (existing) {
        await assertEligibleExistingManager(tx, existing);

        const [alreadyAssigned] = await tx
          .select({ adminUserId: storeManagerAssignments.adminUserId })
          .from(storeManagerAssignments)
          .where(
            and(
              eq(storeManagerAssignments.storeId, invitation.storeId),
              eq(storeManagerAssignments.adminUserId, existing.id)
            )
          )
          .limit(1);

        if (!alreadyAssigned) {
          await lockStoreManagerQuota(tx, invitation.storeId);
          await tx.insert(storeManagerAssignments).values({
            storeId: invitation.storeId,
            adminUserId: existing.id,
          });
        }

        await tx
          .update(storeManagerInvitations)
          .set({ consumedAt: input.now })
          .where(
            and(
              eq(storeManagerInvitations.storeId, invitation.storeId),
              eq(storeManagerInvitations.email, invitation.email),
              isNull(storeManagerInvitations.consumedAt)
            )
          );

        return { adminUserId: existing.id, email: existing.email };
      }

      await lockStoreManagerQuota(tx, invitation.storeId);

      const [created] = await tx
        .insert(adminUsers)
        .values({
          email: invitation.email,
          passwordHash,
          role: "tenant_admin",
          isActive: true,
        })
        .returning({
          id: adminUsers.id,
          email: adminUsers.email,
        });

      if (!created) throw new Error("Manager account creation failed");

      await tx.insert(storeManagerAssignments).values({
        storeId: invitation.storeId,
        adminUserId: created.id,
      });

      await tx
        .update(storeManagerInvitations)
        .set({ consumedAt: input.now })
        .where(
          and(
            eq(storeManagerInvitations.storeId, invitation.storeId),
            eq(storeManagerInvitations.email, invitation.email),
            isNull(storeManagerInvitations.consumedAt)
          )
        );

      return { adminUserId: created.id, email: created.email };
    });
  }

  async remove(storeId: number, adminUserId: number) {
    await getControlPlaneDb()
      .delete(storeManagerAssignments)
      .where(
        and(
          eq(storeManagerAssignments.storeId, storeId),
          eq(storeManagerAssignments.adminUserId, adminUserId)
        )
      );
  }
}
