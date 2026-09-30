import {
  trustedTenantFromRegistryRecord,
  type TrustedTenant,
} from "../tenant-registry/core.ts";

export type StoreManagementRole = "owner" | "manager";

export type StoreManagementPermission =
  | "store.read"
  | "store.operate"
  | "domain.manage"
  | "payment_configuration.manage"
  | "subscription.manage"
  | "billing.manage"
  | "organization.manage"
  | "store_lifecycle.manage"
  | "team.manage";

export type StoreManagementPrincipal =
  | {
      kind: "merchant";
      merchantId: number;
      email: string;
    }
  | {
      kind: "manager";
      adminUserId: number;
      email: string;
      role: "tenant_admin" | "super_admin";
      isActive: boolean;
      legacyTenantSlugs: string[];
    };

export type StoreManagementRecord = {
  store: {
    id: number;
    organizationId: number;
    displayName: string;
    slug: string;
    status:
      | "draft"
      | "ready_for_provisioning"
      | "activation_requested"
      | "provisioning"
      | "provisioning_failed"
      | "provisioned";
    tenantId: number | null;
    deletedAt: Date | null;
  };
  tenant: {
    id: number;
    slug: string;
    schemaName: string;
    displayName: string;
    status: "active" | "suspended" | "disabled";
  } | null;
};

export interface StoreManagementRepository {
  findOwnedStore(
    merchantId: number,
    storeId: number
  ): Promise<StoreManagementRecord | null>;
  findManagedStore(
    adminUserId: number,
    storeId: number
  ): Promise<StoreManagementRecord | null>;
  listManagedStores(adminUserId: number): Promise<StoreManagementRecord[]>;
}

export type StoreManagementContext = {
  principal: StoreManagementPrincipal;
  role: StoreManagementRole;
  store: StoreManagementRecord["store"];
  permissions: ReadonlySet<StoreManagementPermission>;
};

export type ActiveStoreManagementContext = StoreManagementContext & {
  tenant: TrustedTenant;
  controlTenant: NonNullable<StoreManagementRecord["tenant"]>;
};

export type StoreManagementErrorCode =
  | "STORE_NOT_FOUND"
  | "PERMISSION_DENIED"
  | "TENANT_UNAVAILABLE";

export class StoreManagementAuthorizationError extends Error {
  constructor(
    public readonly code: StoreManagementErrorCode,
    message: string
  ) {
    super(message);
    this.name = "StoreManagementAuthorizationError";
  }
}

const OWNER_PERMISSIONS = new Set<StoreManagementPermission>([
  "store.read",
  "store.operate",
  "domain.manage",
  "payment_configuration.manage",
  "subscription.manage",
  "billing.manage",
  "organization.manage",
  "store_lifecycle.manage",
  "team.manage",
]);

const MANAGER_PERMISSIONS = new Set<StoreManagementPermission>([
  "store.read",
  "store.operate",
]);

export function storeManagementPermissionsForRole(
  role: StoreManagementRole
): ReadonlySet<StoreManagementPermission> {
  return role === "owner" ? OWNER_PERMISSIONS : MANAGER_PERMISSIONS;
}

export function hasStoreManagementPermission(
  context: Pick<StoreManagementContext, "permissions">,
  permission: StoreManagementPermission
) {
  return context.permissions.has(permission);
}

export async function requireStoreManagementAccess(
  repository: StoreManagementRepository,
  principal: StoreManagementPrincipal,
  storeId: number,
  permission: StoreManagementPermission = "store.read"
): Promise<StoreManagementContext> {
  if (!Number.isSafeInteger(storeId) || storeId <= 0) {
    throw new StoreManagementAuthorizationError(
      "STORE_NOT_FOUND",
      "Store not found"
    );
  }

  let role: StoreManagementRole;
  let record: StoreManagementRecord | null;

  if (principal.kind === "merchant") {
    role = "owner";
    record = await repository.findOwnedStore(principal.merchantId, storeId);
  } else {
    if (
      !principal.isActive ||
      principal.role !== "tenant_admin" ||
      principal.legacyTenantSlugs.length > 0
    ) {
      throw new StoreManagementAuthorizationError(
        "PERMISSION_DENIED",
        "Store access denied"
      );
    }
    role = "manager";
    record = await repository.findManagedStore(principal.adminUserId, storeId);
  }

  if (!record || record.store.deletedAt !== null) {
    throw new StoreManagementAuthorizationError(
      "STORE_NOT_FOUND",
      "Store not found"
    );
  }

  const permissions = storeManagementPermissionsForRole(role);
  if (!permissions.has(permission)) {
    throw new StoreManagementAuthorizationError(
      "PERMISSION_DENIED",
      "Store permission denied"
    );
  }

  return {
    principal,
    role,
    store: record.store,
    permissions,
  };
}

export async function requireActiveStoreManagementTenant(
  repository: StoreManagementRepository,
  principal: StoreManagementPrincipal,
  storeId: number,
  permission: StoreManagementPermission = "store.read"
): Promise<ActiveStoreManagementContext> {
  const context = await requireStoreManagementAccess(
    repository,
    principal,
    storeId,
    permission
  );

  const record =
    principal.kind === "merchant"
      ? await repository.findOwnedStore(principal.merchantId, storeId)
      : await repository.findManagedStore(principal.adminUserId, storeId);

  if (
    !record ||
    context.store.status !== "provisioned" ||
    context.store.tenantId === null ||
    !record.tenant ||
    record.tenant.id !== context.store.tenantId
  ) {
    throw new StoreManagementAuthorizationError(
      "TENANT_UNAVAILABLE",
      "Store tenant is unavailable"
    );
  }

  const tenant = trustedTenantFromRegistryRecord(record.tenant);
  if (!tenant) {
    throw new StoreManagementAuthorizationError(
      "TENANT_UNAVAILABLE",
      "Store tenant is unavailable"
    );
  }

  return {
    ...context,
    tenant,
    controlTenant: record.tenant,
  };
}
