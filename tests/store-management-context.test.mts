import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
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


test("Draft Store keeps control-plane Owner access but cannot open a tenant DB", async () => {
  const repository = new FakeRepository();
  const draftStore: StoreManagementRecord = {
    ...activeStore,
    store: {
      ...activeStore.store,
      status: "draft",
      tenantId: null,
    },
    tenant: null,
  };
  repository.owned.set("10:4", draftStore);

  const context = await requireStoreManagementAccess(repository, owner, 4);
  assert.equal(context.store.status, "draft");

  await assert.rejects(
    () => requireActiveStoreManagementTenant(repository, owner, 4),
    (error: unknown) =>
      error instanceof StoreManagementAuthorizationError &&
      error.code === "TENANT_UNAVAILABLE"
  );
});

test("Deleted and malformed Store identifiers fail closed", async () => {
  const repository = new FakeRepository();
  repository.owned.set("10:4", {
    ...activeStore,
    store: { ...activeStore.store, deletedAt: new Date("2026-09-30T00:00:00Z") },
  });

  await assert.rejects(
    () => requireStoreManagementAccess(repository, owner, 4),
    (error: unknown) =>
      error instanceof StoreManagementAuthorizationError &&
      error.code === "STORE_NOT_FOUND"
  );

  for (const storeId of [0, -1, 1.5, Number.NaN]) {
    await assert.rejects(
      () => requireStoreManagementAccess(repository, owner, storeId),
      (error: unknown) =>
        error instanceof StoreManagementAuthorizationError &&
        error.code === "STORE_NOT_FOUND"
    );
  }

  assert.deepEqual(repository.ownerLookups, [[10, 4]]);
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


test("Store Manager migration is journaled after PR #47 migration", async () => {
  const journal = JSON.parse(
    await readFile("src/drizzle/control-migrations/meta/_journal.json", "utf8")
  );
  const entry = journal.entries.find(
    (candidate: { tag?: string }) =>
      candidate.tag === "0016_store_manager_assignments"
  );

  assert.ok(entry);
  assert.equal(entry.idx, 16);
  assert.equal(entry.version, "7");
  assert.equal(entry.breakpoints, true);
});

test("Server Store Management context uses authenticated principals and trusted tenant DB only", async () => {
  const source = await readFile(
    "src/lib/store-management/server.ts",
    "utf8"
  );

  assert.match(source, /getCurrentMerchant/);
  assert.match(source, /getCurrentAdminSession/);
  assert.match(source, /getCurrentStoreDashboardPrincipal/);
  assert.match(source, /listManagedStores\(admin\.id\)/);
  assert.match(source, /legacyTenantSlugs: admin\.tenantSlugs/);
  assert.match(source, /getDbForTenant\(context\.tenant\)/);
  assert.doesNotMatch(
    source,
    /getTenant\(|TENANT_SCHEMA_HEADER|schemaName.*storeId|search_path/
  );
});

test("Merchant Store form uses shared management controls", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/_components/StoreForm.tsx",
    "utf8"
  );

  assert.match(source, /ManagementInput/);
  assert.match(source, /size="management"/);
  assert.doesNotMatch(source, /const inputClass/);
  assert.doesNotMatch(source, /const buttonClass/);
  assert.doesNotMatch(source, /<button\\b/);
});

test("Store team page uses shared management controls", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/team/page.tsx",
    "utf8"
  );

  assert.match(source, /ManagementInput/);
  assert.match(source, /size="management"/);
  assert.match(source, /<Button asChild variant="outline" size="management"/);
  assert.doesNotMatch(source, /<button\\b/);
  assert.doesNotMatch(source, /min-h-10/);
});

test("Store policies use shared management controls", async () => {
  const [editor, page] = await Promise.all([
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/policies/PolicyDocumentForm.tsx",
      "utf8"
    ),
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/policies/page.tsx",
      "utf8"
    ),
  ]);

  assert.match(editor, /ManagementInput/);
  assert.match(editor, /ManagementTextarea/);
  assert.match(editor, /size="management"/);
  assert.doesNotMatch(editor, /<button\\b/);
  assert.doesNotMatch(editor, /<textarea\\b/);
  assert.match(page, /<Button asChild variant="outline" size="management"/);
});

test("Business organization screens use shared management controls", async () => {
  const [form, page] = await Promise.all([
    readFile(
      "src/app/(merchant)/dashboard/business/_components/OrganizationForm.tsx",
      "utf8"
    ),
    readFile(
      "src/app/(merchant)/dashboard/business/page.tsx",
      "utf8"
    ),
  ]);

  assert.match(form, /ManagementInput/);
  assert.match(form, /size="management"/);
  assert.doesNotMatch(form, /const inputClass/);
  assert.doesNotMatch(form, /const buttonClass/);
  assert.doesNotMatch(form, /<button\\b/);
  assert.match(page, /<Button asChild size="management"/);
  assert.match(page, /<Button asChild variant="outline" size="management"/);
});

test("Merchant dashboard shell uses shared 44px utility controls and focus states", async () => {
  const [layout, languageSwitcher, navigation] = await Promise.all([
    readFile("src/app/(merchant)/dashboard/layout.tsx", "utf8"),
    readFile(
      "src/app/(merchant)/dashboard/_components/DashboardLanguageSwitcher.tsx",
      "utf8"
    ),
    readFile(
      "src/app/(merchant)/dashboard/_components/DashboardNavigation.tsx",
      "utf8"
    ),
  ]);

  assert.match(layout, /<Button[\s\S]*?size="management"/);
  assert.doesNotMatch(layout, /<button\\b/);
  assert.match(languageSwitcher, /<Button/);
  assert.match(languageSwitcher, /size="management"/);
  assert.doesNotMatch(languageSwitcher, /<button\\b/);
  assert.match(navigation, /min-h-11/);
  assert.match(navigation, /focus-visible:ring-2/);
});

test("Store detail and Store list use shared management controls", async () => {
  const [detail, list] = await Promise.all([
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/page.tsx",
      "utf8"
    ),
    readFile(
      "src/app/(merchant)/dashboard/stores/_components/StoreList.tsx",
      "utf8"
    ),
  ]);

  assert.match(detail, /ManagementSelect/);
  assert.match(detail, /size="management"/);
  assert.doesNotMatch(detail, /<select\\b/);
  assert.doesNotMatch(detail, /<button\\b/);
  assert.match(list, /size="management"/);
  assert.doesNotMatch(list, /<button\\b/);
});

test("Merchant same-page mutations preserve the current management workspace", async () => {
  const [
    mutation,
    detail,
    detailActions,
    team,
    teamActions,
    domain,
    policies,
    storeList,
  ] = await Promise.all([
    readFile("src/components/management/ManagementMutation.tsx", "utf8"),
    readFile("src/app/(merchant)/dashboard/stores/[id]/page.tsx", "utf8"),
    readFile("src/app/(merchant)/dashboard/stores/[id]/_actions.ts", "utf8"),
    readFile("src/app/(merchant)/dashboard/stores/[id]/team/page.tsx", "utf8"),
    readFile("src/app/(merchant)/dashboard/stores/[id]/_actions/team.ts", "utf8"),
    readFile("src/app/(merchant)/dashboard/stores/[id]/domain/DomainManager.tsx", "utf8"),
    readFile("src/app/(merchant)/dashboard/stores/[id]/policies/PolicyDocumentForm.tsx", "utf8"),
    readFile("src/app/(merchant)/dashboard/stores/_components/StoreList.tsx", "utf8"),
  ]);

  assert.match(mutation, /event\.preventDefault\(\)/);
  assert.match(mutation, /router\.refresh\(\)/);
  assert.doesNotMatch(mutation, /router\.push|router\.replace|window\.location/);

  assert.match(detail, /ManagementMutationForm/);
  assert.doesNotMatch(detailActions, /next\/navigation/);
  assert.doesNotMatch(detailActions, /redirect\(/);

  assert.match(team, /ManagementMutationForm/);
  assert.doesNotMatch(teamActions, /next\/navigation/);
  assert.doesNotMatch(teamActions, /redirect\(/);

  assert.match(domain, /event\.preventDefault\(\)/);
  assert.match(domain, /router\.refresh\(\)/);
  assert.match(policies, /useActionState/);
  assert.match(storeList, /router\.refresh\(\)/);
});

test("plan feature gates are entitlement-driven instead of package-name checks", async () => {
  const sources = await Promise.all([
    readFile("src/app/(merchant)/dashboard/stores/[id]/domain/_actions.ts", "utf8"),
    readFile("src/app/(merchant)/dashboard/stores/[id]/domain/page.tsx", "utf8"),
    readFile("src/app/(merchant)/dashboard/stores/[id]/products/page.tsx", "utf8"),
    readFile("src/app/(merchant)/dashboard/stores/[id]/_actions/catalog.ts", "utf8"),
    readFile("src/lib/store-team/drizzle-repository.ts", "utf8"),
    readFile("src/lib/store-team/core.ts", "utf8"),
  ]);

  const combined = sources.join("\n");

  assert.match(combined, /custom_domain/);
  assert.match(combined, /products_limit/);
  assert.match(combined, /store_managers/);
  assert.doesNotMatch(
    combined,
    /(?:planCode|plan\.code)\s*(?:===|!==|==|!=)\s*["'](?:free|small|medium|large)["']/i
  );
  assert.doesNotMatch(
    combined,
    /["'](?:free|small|medium|large)["']\s*(?:===|!==|==|!=)\s*(?:planCode|plan\.code)/i
  );
});

test("runtime feature gates contain no hard-coded commercial package codes", async () => {
  const roots = ["src", "scripts"];
  const runtimeFiles: string[] = [];

  for (const root of roots) {
    const entries = await readdir(root, { recursive: true });
    for (const entry of entries) {
      const path = `${root}/${entry}`;
      if (/\.(?:ts|tsx|js|jsx|mts|mjs)$/.test(path)) {
        runtimeFiles.push(path);
      }
    }
  }

  const tierLiteral = /["'`](?:free|small|medium|large)["'`]/i;
  const commercialContext =
    /plan|tier|package|subscription|entitlement|feature|capability/i;
  const violations: string[] = [];

  for (const path of runtimeFiles) {
    const lines = (await readFile(path, "utf8")).split("\n");

    for (let index = 0; index < lines.length; index += 1) {
      if (!tierLiteral.test(lines[index] ?? "")) continue;

      const line = lines[index] ?? "";

      if (/dateStyle\s*:\s*["'`]medium["'`]/.test(line)) {
        continue;
      }

      if (/shippingPrice\s*===\s*0\s*\?\s*["'`]Free["'`]/.test(line)) {
        continue;
      }

      const context = lines
        .slice(Math.max(0, index - 3), Math.min(lines.length, index + 4))
        .join("\n");

      if (commercialContext.test(context)) {
        violations.push(
          `${path}:${index + 1}: ${line.trim()}`
        );
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    "Commercial package codes must not drive runtime feature behavior; use plan entitlements instead:\n" +
      violations.join("\n")
  );
});

test("merchant Store and subscription repositories authorize exact Stores across all owned organizations", async () => {
  const [storeRepository, subscriptionRepository] = await Promise.all([
    readFile("src/lib/merchant-stores/drizzle-repository.ts", "utf8"),
    readFile("src/lib/merchant-subscriptions/drizzle-repository.ts", "utf8"),
  ]);

  for (const source of [storeRepository, subscriptionRepository]) {
    assert.match(source, /organizationMemberships\.organizationId/);
    assert.match(source, /organizationMemberships\.merchantAccountId/);
    assert.match(source, /organizationMemberships\.role, "owner"/);
    assert.match(source, /eq\(stores\.id, storeId\)/);
  }

  assert.match(
    storeRepository,
    /listForMerchant[\s\S]*?innerJoin\([\s\S]*?organizationMemberships[\s\S]*?merchantAccountId, merchantId/
  );
  assert.match(
    subscriptionRepository,
    /findForOwnedStore[\s\S]*?eq\(stores\.id, storeId\)[\s\S]*?merchantAccountId, merchantId/
  );
  assert.doesNotMatch(subscriptionRepository, /ownerOrganizationId/);
});

test("tenant plan snapshot has no package-code default", async () => {
  const [tenantSchema, migration] = await Promise.all([
    readFile("src/drizzle/control-schema/tenant.ts", "utf8"),
    readFile(
      "src/drizzle/control-migrations/0022_drop_tenant_plan_default.sql",
      "utf8"
    ),
  ]);

  assert.match(tenantSchema, /plan:\s*varchar\("plan", \{ length: 64 \}\)\.notNull\(\)/);
  assert.doesNotMatch(tenantSchema, /plan:[^\n]*default\(["'](?:free|small|medium|large)["']\)/i);
  assert.match(migration, /ALTER COLUMN "plan" DROP DEFAULT/);
});

test("domain claim core has no legacy package-code custom-domain gate", async () => {
  const source = await readFile("src/lib/domain-claims/core.ts", "utf8");

  assert.doesNotMatch(source, /CUSTOM_DOMAIN_PLAN_CODES|planAllowsCustomDomain|CustomDomainPlanCode/);
  assert.doesNotMatch(source, /["'](?:free|small|medium|large)["']/i);
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

  async listManagedStores(adminUserId: number) {
    return [...this.managed.entries()]
      .filter(([key]) => key.startsWith(`${adminUserId}:`))
      .map(([, value]) => value);
  }
}
