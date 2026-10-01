import "server-only";

import { requireOwnerStoreManagementContext } from "@/lib/store-management/server";
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
