import "server-only";

import { and, count, eq, sql } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/db";
import {
  adminUsers,
  adminUserTenants,
  entitlements,
  planEntitlements,
  plans,
  storeManagerAssignments,
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

  async createAndAssign(
    storeId: number,
    email: string,
    password: string
  ): Promise<StoreManager> {
    const normalizedEmail = normalizeManagerEmail(email);
    const passwordHash = await hashAdminPassword(password);

    return getControlPlaneDb().transaction(async (tx) => {
      await lockStoreManagerQuota(tx, storeId);

      const [existing] = await tx
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.email, normalizedEmail))
        .limit(1);
      if (existing) {
        throw new StoreTeamError(
          "MANAGER_ACCOUNT_UNAVAILABLE",
          "An admin account already exists for this email"
        );
      }

      const [created] = await tx
        .insert(adminUsers)
        .values({
          email: normalizedEmail,
          passwordHash,
          role: "tenant_admin",
          isActive: true,
        })
        .returning({
          id: adminUsers.id,
          email: adminUsers.email,
          isActive: adminUsers.isActive,
          createdAt: adminUsers.createdAt,
        });
      if (!created) throw new Error("Manager account creation failed");

      await tx.insert(storeManagerAssignments).values({
        storeId,
        adminUserId: created.id,
      });

      return {
        adminUserId: created.id,
        email: created.email,
        isActive: created.isActive,
        createdAt: created.createdAt,
      };
    });
  }

  async assignExisting(storeId: number, email: string): Promise<StoreManager> {
    const normalizedEmail = normalizeManagerEmail(email);

    return getControlPlaneDb().transaction(async (tx) => {
      await lockStoreManagerQuota(tx, storeId);

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

      if (!manager) {
        throw new StoreTeamError("MANAGER_NOT_FOUND", "Manager account not found");
      }
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

      const [alreadyAssigned] = await tx
        .select({ adminUserId: storeManagerAssignments.adminUserId })
        .from(storeManagerAssignments)
        .where(
          and(
            eq(storeManagerAssignments.storeId, storeId),
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
        .values({ storeId, adminUserId: manager.id })
        .returning({ createdAt: storeManagerAssignments.createdAt });

      return {
        adminUserId: manager.id,
        email: manager.email,
        isActive: manager.isActive,
        createdAt: assignment?.createdAt ?? manager.createdAt,
      };
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
