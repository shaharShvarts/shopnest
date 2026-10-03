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
  generateStoreManagerInvitationToken,
  hashStoreManagerInvitationToken,
  STORE_MANAGER_INVITATION_TTL_MS,
  STORE_MANAGERS_ENTITLEMENT,
} from "./core";
import { DrizzleStoreTeamRepository } from "./drizzle-repository";
import {
  createStoreManagerInvitationDelivery,
  type StoreManagerInvitationDelivery,
} from "./invitation-delivery";

const repository = new DrizzleStoreTeamRepository();

export async function listOwnedStoreManagers(storeId: number) {
  await requireOwnerStoreManagementContext(storeId, "team.manage");
  return repository.list(storeId);
}

export async function getOwnedStoreManagerQuota(storeId: number) {
  await requireOwnerStoreManagementContext(storeId, "team.manage");
  return repository.quota(storeId);
}

export async function inviteOwnedStoreManager(
  storeId: number,
  email: string,
  buildInvitationUrl: (token: string) => string,
  delivery: StoreManagerInvitationDelivery = createStoreManagerInvitationDelivery(),
  now = new Date()
) {
  const context = await requireOwnerStoreManagementContext(storeId, "team.manage");
  const token = generateStoreManagerInvitationToken();
  const tokenHash = hashStoreManagerInvitationToken(token);

  const result = await repository.inviteOrAssign({
    storeId,
    email,
    tokenHash,
    expiresAt: new Date(now.getTime() + STORE_MANAGER_INVITATION_TTL_MS),
    now,
  });

  if (result.kind === "assigned_existing") {
    return result;
  }

  try {
    await delivery.deliverInvitation({
      email: result.email,
      invitationUrl: buildInvitationUrl(token),
      storeName: context.store.displayName,
    });
  } catch (error) {
    await repository.deleteInvitationByTokenHash(tokenHash);
    throw error;
  }

  return result;
}

export async function inspectStoreManagerInvitation(
  token: string,
  now = new Date()
) {
  if (!token) return { kind: "invalid" as const };
  return repository.inspectInvitation(
    hashStoreManagerInvitationToken(token),
    now
  );
}

export async function completeStoreManagerInvitation(
  token: string,
  password: string,
  now = new Date()
) {
  return repository.completeInvitation({
    tokenHash: hashStoreManagerInvitationToken(token),
    password,
    now,
  });
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
