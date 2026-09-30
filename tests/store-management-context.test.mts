import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  hasStoreManagementPermission,
  requireActiveStoreManagementTenant,
  requireStoreManagementAccess,
  StoreManagementAuthorizationError,
  type StoreManagementPrincipal,
  type StoreManagementRecord,
  type StoreManagementRepository,
} from "../src/lib/store-management/core.ts";

const activeStore: StoreManagementRecord = {
  store: {
    id: 4,
    organizationId: 1,
    displayName: "sex shop",
    slug: "sex-shop",
    status: "provisioned",
    tenantId: 2,
    deletedAt: null,
  },
  tenant: {
    id: 2,
    slug: "sex-shop",
    schemaName: "tenant_4",
    displayName: "sex shop",
    status: "active",
  },
};

const owner: StoreManagementPrincipal = {
  kind: "merchant",
  merchantId: 10,
  email: "owner@example.com",
};

const manager: StoreManagementPrincipal = {
  kind: "manager",
  adminUserId: 20,
  email: "manager@example.com",
  role: "tenant_admin",
  isActive: true,
  legacyTenantSlugs: [],
};

test("Owner resolves an exact owned Store without relying on a first organization", async () => {
  const repository = new FakeRepository();
  repository.owned.set("10:4", activeStore);

  const context = await requireStoreManagementAccess(
    repository,
    owner,
    4,
    "store.operate"
  );

  assert.equal(context.role, "owner");
  assert.equal(context.store.id, 4);
  assert.equal(hasStoreManagementPermission(context, "domain.manage"), true);
  assert.deepEqual(repository.ownerLookups, [[10, 4]]);
});

test("Owner cannot resolve another organization's Store", async () => {
  const repository = new FakeRepository();

  await assert.rejects(
    () => requireStoreManagementAccess(repository, owner, 99),
    (error: unknown) =>
      error instanceof StoreManagementAuthorizationError &&
      error.code === "STORE_NOT_FOUND"
  );
});

test("Manager can access only an explicitly assigned Store", async () => {
  const repository = new FakeRepository();
  repository.managed.set("20:4", activeStore);

  const context = await requireStoreManagementAccess(
    repository,
    manager,
    4,
    "store.operate"
  );
  assert.equal(context.role, "manager");
  assert.equal(context.store.id, 4);

  await assert.rejects(
    () => requireStoreManagementAccess(repository, manager, 5),
    (error: unknown) =>
      error instanceof StoreManagementAuthorizationError &&
      error.code === "STORE_NOT_FOUND"
  );
});

test("Manager is denied every Owner-only sensitive permission", async () => {
  const repository = new FakeRepository();
  repository.managed.set("20:4", activeStore);

  for (const permission of [
    "domain.manage",
    "payment_configuration.manage",
    "subscription.manage",
    "billing.manage",
    "organization.manage",
    "store_lifecycle.manage",
    "team.manage",
  ] as const) {
    await assert.rejects(
      () =>
        requireStoreManagementAccess(
          repository,
          manager,
          4,
          permission
        ),
      (error: unknown) =>
        error instanceof StoreManagementAuthorizationError &&
        error.code === "PERMISSION_DENIED"
    );
  }
});

test("Super Admin, inactive users, and legacy Tenant Admins do not become Store Managers", async () => {
  const repository = new FakeRepository();
  repository.managed.set("20:4", activeStore);

  for (const principal of [
    { ...manager, role: "super_admin" as const },
    { ...manager, isActive: false },
    { ...manager, legacyTenantSlugs: ["sex-shop"] },
  ]) {
    await assert.rejects(
      () => requireStoreManagementAccess(repository, principal, 4),
      (error: unknown) =>
        error instanceof StoreManagementAuthorizationError &&
        error.code === "PERMISSION_DENIED"
    );
  }
});

test("Active Store context derives a branded trusted tenant from the control plane", async () => {
  const repository = new FakeRepository();
  repository.owned.set("10:4", activeStore);

  const context = await requireActiveStoreManagementTenant(
    repository,
    owner,
    4
  );

  assert.equal(context.tenant.slug, "sex-shop");
  assert.equal(context.tenant.schema, "tenant_4");
});

test("Unprovisioned, suspended, mismatched, and unsafe tenant bindings fail closed", async () => {
  for (const record of [
    {
      ...activeStore,
      store: { ...activeStore.store, status: "draft", tenantId: null },
      tenant: null,
    },
    {
      ...activeStore,
      tenant: { ...activeStore.tenant!, status: "suspended" as const },
    },
    {
      ...activeStore,
      tenant: { ...activeStore.tenant!, id: 999 },
    },
    {
      ...activeStore,
      tenant: { ...activeStore.tenant!, schemaName: "public" },
    },
  ]) {
    const repository = new FakeRepository();
    repository.owned.set("10:4", record);

    await assert.rejects(
      () => requireActiveStoreManagementTenant(repository, owner, 4),
      (error: unknown) =>
        error instanceof StoreManagementAuthorizationError &&
        error.code === "TENANT_UNAVAILABLE"
    );
  }
});

test("Manager assignment migration is Store-level and additive", async () => {
  const sql = await readFile(
    "src/drizzle/control-migrations/0016_store_manager_assignments.sql",
    "utf8"
  );

  assert.match(sql, /store_manager_assignments/);
  assert.match(sql, /"store_id" integer NOT NULL/);
  assert.match(sql, /"admin_user_id" integer NOT NULL/);
  assert.match(sql, /PRIMARY KEY.*"store_id".*"admin_user_id"/s);
  assert.match(sql, /REFERENCES "public"\."stores"\("id"\)/);
  assert.match(sql, /REFERENCES "public"\."admin_users"\("id"\)/);
  assert.doesNotMatch(sql, /admin_user_tenants|tenant_slug|schema_name/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP SCHEMA|TRUNCATE/);
});

test("Store Management repository scopes ownership and managers by exact Store", async () => {
  const source = await readFile(
    "src/lib/store-management/drizzle-repository.ts",
    "utf8"
  );

  assert.match(source, /organizationMemberships\.organizationId/);
  assert.match(source, /organizationMemberships\.merchantAccountId/);
  assert.match(source, /organizationMemberships\.role, "owner"/);
  assert.match(source, /eq\(stores\.id, storeId\)/);
  assert.match(source, /storeManagerAssignments\.storeId/);
  assert.match(source, /storeManagerAssignments\.adminUserId/);
  assert.doesNotMatch(source, /ownerOrganizationId|\.limit\(1\).*organizationId/s);
  assert.doesNotMatch(
    source,
    /getTenant\(|TENANT_SCHEMA_HEADER|search_path|schemaName.*input/
  );
});

class FakeRepository implements StoreManagementRepository {
  owned = new Map<string, StoreManagementRecord>();
  managed = new Map<string, StoreManagementRecord>();
  ownerLookups: Array<[number, number]> = [];
  managerLookups: Array<[number, number]> = [];

  async findOwnedStore(merchantId: number, storeId: number) {
    this.ownerLookups.push([merchantId, storeId]);
    return this.owned.get(`${merchantId}:${storeId}`) ?? null;
  }

  async findManagedStore(adminUserId: number, storeId: number) {
    this.managerLookups.push([adminUserId, storeId]);
    return this.managed.get(`${adminUserId}:${storeId}`) ?? null;
  }
}
