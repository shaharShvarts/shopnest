import "server-only";

import { getDbForTenant } from "@/drizzle/db";
import { redirect } from "next/navigation";
import { getCurrentAdminSession } from "@/lib/admin-auth/server";
import { getCurrentMerchant } from "@/lib/merchant-auth/server";
import {
  requireActiveStoreManagementTenant,
  requireStoreManagementAccess,
  StoreManagementAuthorizationError,
  type StoreManagementPermission,
  type StoreManagementPrincipal,
} from "./core";
import { DrizzleStoreManagementRepository } from "./drizzle-repository";

const repository = new DrizzleStoreManagementRepository();

export type StoreDashboardPrincipal =
  | {
      kind: "owner";
      merchantId: number;
      email: string;
      displayName: string;
      phoneE164: string | null;
      status: "active";
    }
  | {
      kind: "manager";
      adminUserId: number;
      email: string;
      displayName: string;
    };

export async function getCurrentStoreDashboardPrincipal(): Promise<StoreDashboardPrincipal | null> {
  const merchant = await getCurrentMerchant();
  if (merchant) {
    return {
      kind: "owner",
      merchantId: merchant.id,
      email: merchant.email,
      displayName: merchant.displayName,
      phoneE164: merchant.phoneE164,
      status: "active",
    };
  }

  const admin = await getCurrentAdminSession();
  if (
    !admin ||
    !admin.isActive ||
    admin.role !== "tenant_admin" ||
    admin.tenantSlugs.length > 0
  ) {
    return null;
  }

  const stores = await repository.listManagedStores(admin.id);
  if (stores.length === 0) return null;

  return {
    kind: "manager",
    adminUserId: admin.id,
    email: admin.email,
    displayName: admin.email,
  };
}

export async function requireStoreDashboardPrincipal() {
  const principal = await getCurrentStoreDashboardPrincipal();
  if (!principal) redirect("/login");
  return principal;
}

export class StoreManagementServerError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404,
    message: string
  ) {
    super(message);
    this.name = "StoreManagementServerError";
  }
}

function mapAuthorizationError(error: unknown): never {
  if (!(error instanceof StoreManagementAuthorizationError)) {
    throw error;
  }

  if (error.code === "STORE_NOT_FOUND") {
    throw new StoreManagementServerError(404, "Store not found");
  }

  throw new StoreManagementServerError(403, error.message);
}

export async function requireOwnerStoreManagementContext(
  storeId: number,
  permission: StoreManagementPermission = "store.read"
) {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    throw new StoreManagementServerError(401, "Merchant login required");
  }

  const principal: StoreManagementPrincipal = {
    kind: "merchant",
    merchantId: merchant.id,
    email: merchant.email,
  };

  try {
    return await requireStoreManagementAccess(
      repository,
      principal,
      storeId,
      permission
    );
  } catch (error) {
    mapAuthorizationError(error);
  }
}

export async function requireManagerStoreManagementContext(
  storeId: number,
  permission: StoreManagementPermission = "store.read"
) {
  const admin = await getCurrentAdminSession();
  if (!admin) {
    throw new StoreManagementServerError(401, "Manager login required");
  }

  const principal: StoreManagementPrincipal = {
    kind: "manager",
    adminUserId: admin.id,
    email: admin.email,
    role: admin.role,
    isActive: admin.isActive,
    legacyTenantSlugs: admin.tenantSlugs,
  };

  try {
    return await requireStoreManagementAccess(
      repository,
      principal,
      storeId,
      permission
    );
  } catch (error) {
    mapAuthorizationError(error);
  }
}

export async function requireOwnerStoreManagementDb(
  storeId: number,
  permission: StoreManagementPermission = "store.operate"
) {
  const merchant = await getCurrentMerchant();
  if (!merchant) {
    throw new StoreManagementServerError(401, "Merchant login required");
  }

  const principal: StoreManagementPrincipal = {
    kind: "merchant",
    merchantId: merchant.id,
    email: merchant.email,
  };

  try {
    const context = await requireActiveStoreManagementTenant(
      repository,
      principal,
      storeId,
      permission
    );
    return { ...context, db: getDbForTenant(context.tenant) };
  } catch (error) {
    mapAuthorizationError(error);
  }
}

export async function requireManagerStoreManagementDb(
  storeId: number,
  permission: StoreManagementPermission = "store.operate"
) {
  const admin = await getCurrentAdminSession();
  if (!admin) {
    throw new StoreManagementServerError(401, "Manager login required");
  }

  const principal: StoreManagementPrincipal = {
    kind: "manager",
    adminUserId: admin.id,
    email: admin.email,
    role: admin.role,
    isActive: admin.isActive,
    legacyTenantSlugs: admin.tenantSlugs,
  };

  try {
    const context = await requireActiveStoreManagementTenant(
      repository,
      principal,
      storeId,
      permission
    );
    return { ...context, db: getDbForTenant(context.tenant) };
  } catch (error) {
    mapAuthorizationError(error);
  }
}


export async function requireStoreManagementDb(
  storeId: number,
  permission: StoreManagementPermission = "store.operate"
) {
  const principal = await getCurrentStoreDashboardPrincipal();
  if (!principal) {
    throw new StoreManagementServerError(401, "Store login required");
  }

  if (principal.kind === "owner") {
    return requireOwnerStoreManagementDb(storeId, permission);
  }

  return requireManagerStoreManagementDb(storeId, permission);
}

export async function requireStoreManagementContext(
  storeId: number,
  permission: StoreManagementPermission = "store.read"
) {
  const principal = await getCurrentStoreDashboardPrincipal();
  if (!principal) {
    throw new StoreManagementServerError(401, "Store login required");
  }

  if (principal.kind === "owner") {
    return requireOwnerStoreManagementContext(storeId, permission);
  }

  return requireManagerStoreManagementContext(storeId, permission);
}

export function getStoreManagementRepository() {
  return repository;
}
