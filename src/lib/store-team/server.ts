import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/db";
import {
  entitlements,
  planEntitlements,
  plans,
} from "@/drizzle/control-plane-schema";
import { requireOwnerStoreManagementContext } from "@/lib/store-management/server";
import {
  STORE_MANAGERS_ENTITLEMENT,
} from "./core";
import { DrizzleStoreTeamRepository } from "./drizzle-repository";

const repository = new DrizzleStoreTeamRepository();

export async function listOwnedStoreManagers(storeId: number) {
  await requireOwnerStoreManagementContext(storeId, "team.manage");
  return repository.list(storeId);
}

export async function getOwnedStoreManagerQuota(storeId: number) {
  await requireOwnerStoreManagementContext(storeId, "team.manage");
  return repository.quota(storeId);
}

export async function createOwnedStoreManager(
  storeId: number,
  email: string,
  password: string
) {
  await requireOwnerStoreManagementContext(storeId, "team.manage");
  return repository.createAndAssign(storeId, email, password);
}

export async function assignExistingOwnedStoreManager(
  storeId: number,
  email: string
) {
  await requireOwnerStoreManagementContext(storeId, "team.manage");
  return repository.assignExisting(storeId, email);
}

export async function removeOwnedStoreManager(
  storeId: number,
  adminUserId: number
) {
  await requireOwnerStoreManagementContext(storeId, "team.manage");
  await repository.remove(storeId, adminUserId);
}

export function getStoreTeamRepository() {
  return repository;
}


export async function listStoreManagerPlanOptions() {
  const rows = await getControlPlaneDb()
    .select({
      planCode: plans.code,
      planName: plans.name,
      limit: planEntitlements.value,
    })
    .from(planEntitlements)
    .innerJoin(plans, eq(plans.id, planEntitlements.planId))
    .innerJoin(
      entitlements,
      eq(entitlements.id, planEntitlements.entitlementId)
    )
    .where(
      and(
        eq(entitlements.code, STORE_MANAGERS_ENTITLEMENT),
        eq(plans.status, "active")
      )
    )
    .orderBy(asc(plans.id));

  return rows;
}
