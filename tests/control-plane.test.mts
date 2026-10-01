import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { AdminPrincipal } from "../src/lib/admin-auth/core.ts";
import { normalizeTenantSlug } from "../src/lib/tenant-validation.mjs";
import {
  isTenantAdminPath,
  resolveTenantRoute,
} from "../src/lib/tenant-routing/core.ts";
import {
  authorizeStoreMutation,
  buildStoreSummaries,
  findTrustedStore,
  resolveTrustedStore,
  storeMutationSchema,
  summarizePlatform,
  type ControlPlaneStore,
  type StoreSummary,
} from "../src/lib/control-plane/core.ts";

const stores: ControlPlaneStore[] = [
  store("gift-shop", "gift_shop", "Gift Shop"),
  store("panda-pop", "panda_pop", "Panda Pop"),
];

const fixtureTenantSlugs = new Set(["gift-shop", "panda-pop"]);
function resolveFixtureTenant(value: unknown) {
  const tenant = normalizeTenantSlug(value);
  return tenant && fixtureTenantSlugs.has(tenant.slug) ? tenant : null;
}
const superAdmin: AdminPrincipal = {
  id: 1,
  email: "platform@example.com",
  role: "super_admin",
  isActive: true,
  tenantSlugs: [],
};
const mutation = {
  slug: "gift-shop",
  status: "active",
  plan: "medium",
  featured: true,
  featuredRank: 1,
  supportNotes: null,
};

test("super admin access works without a tenant assignment", () => {
  assert.deepEqual(authorizeStoreMutation(superAdmin, mutation), mutation);
});

test("platform and tenant admin routes remain isolated", () => {
  assert.deepEqual(resolveTenantRoute("/admin"), { kind: "legacy" });
  assert.deepEqual(resolveTenantRoute("/admin/login"), { kind: "legacy" });

  const tenantAdmin = resolveTenantRoute("/gift-shop/admin", resolveFixtureTenant);
  assert.equal(tenantAdmin.kind, "tenant");
  if (tenantAdmin.kind === "tenant") {
    assert.equal(tenantAdmin.internalPath, "/admin");
    assert.equal(isTenantAdminPath(tenantAdmin.internalPath), true);
  }

  const tenantLogin = resolveTenantRoute("/gift-shop/admin/login", resolveFixtureTenant);
  assert.equal(tenantLogin.kind, "tenant");
  if (tenantLogin.kind === "tenant") {
    assert.equal(isTenantAdminPath(tenantLogin.internalPath), true);
  }

  assert.equal(isTenantAdminPath("/products"), false);
  assert.deepEqual(resolveTenantRoute("/unknown-store/admin"), { kind: "not-found" });
});

test("unauthenticated and tenant admins cannot change status, plan, or featured state", () => {
  assert.throws(() => authorizeStoreMutation(null, mutation), { code: "FORBIDDEN" });
  assert.throws(
    () => authorizeStoreMutation({ ...superAdmin, role: "tenant_admin", tenantSlugs: ["gift-shop"] }, mutation),
    { code: "FORBIDDEN" }
  );
});

test("plans accept only small, medium, and large", () => {
  for (const plan of ["small", "medium", "large"]) {
    assert.equal(storeMutationSchema.safeParse({ ...mutation, plan }).success, true);
  }
  assert.equal(storeMutationSchema.safeParse({ ...mutation, plan: "enterprise" }).success, false);
  assert.equal(storeMutationSchema.safeParse({ ...mutation, featured: false, featuredRank: 1 }).success, false);
});

test("active control-plane tenant rows are the trusted dynamic registry", () => {
  assert.deepEqual(stores.map((store) => store.slug), ["gift-shop", "panda-pop"]);
  assert.equal(findTrustedStore(stores, "gift-shop")?.slug, "gift-shop");
  assert.equal(findTrustedStore(stores, "unknown-store"), null);
  assert.equal(resolveTrustedStore(stores[0])?.schema, "gift_shop");
});

test("unsafe or inactive registry rows cannot select a tenant database", () => {
  assert.equal(
    resolveTrustedStore(store("gift-shop", "public", "Spoofed")),
    null
  );
  assert.equal(
    resolveTrustedStore({ ...stores[0], status: "suspended" }),
    null
  );
  assert.equal(
    resolveTrustedStore({ ...stores[0], status: "disabled" }),
    null
  );
});

test("active trusted registry rows may load isolated tenant metrics", async () => {
  let calls = 0;
  const summaries = await buildStoreSummaries(stores, async (tenant) => {
    calls += 1;
    assert.ok(["gift_shop", "panda_pop"].includes(tenant.schema));
    return {
      orderCount: 1,
      salesVolume: 1,
      ordersToday: 1,
      revenueToday: 1,
      lastActivity: null,
    };
  });

  assert.equal(calls, 2);
  assert.deepEqual(
    summaries.map((summary) => ({
      slug: summary.slug,
      kind: summary.kind,
    })),
    [
      { slug: "gift-shop", kind: "available" },
      { slug: "panda-pop", kind: "available" },
    ]
  );
});

test("aggregation sums explicit trusted summaries without cross-tenant attribution", () => {
  const summaries: StoreSummary[] = [
    {
      ...stores[0],
      kind: "available",
      metrics: {
        orderCount: 2,
        salesVolume: 200,
        ordersToday: 1,
        revenueToday: 80,
        lastActivity: new Date("2026-09-10T08:00:00Z"),
      },
    },
    {
      ...stores[1],
      kind: "available",
      metrics: {
        orderCount: 9,
        salesVolume: 900,
        ordersToday: 3,
        revenueToday: 300,
        lastActivity: null,
      },
    },
  ];

  assert.deepEqual(summarizePlatform(summaries), {
    registeredStores: 2,
    activeStores: 2,
    unavailableStores: 0,
    totalOrders: 11,
    totalRevenue: 1100,
    ordersToday: 4,
    revenueToday: 380,
    complete: true,
    failedStores: [],
  });
});

test("explicit tenant failure produces a partial total without misattribution", () => {
  const summaries: StoreSummary[] = [
    {
      ...stores[0],
      kind: "available",
      metrics: {
        orderCount: 2,
        salesVolume: 200,
        ordersToday: 1,
        revenueToday: 80,
        lastActivity: null,
      },
    },
    {
      ...stores[1],
      kind: "unavailable",
      reason: "query_failed",
    },
  ];

  const total = summarizePlatform(summaries);
  assert.equal(total.complete, false);
  assert.deepEqual(total.failedStores, ["panda-pop"]);
  assert.equal(total.totalOrders, 2);
  assert.equal(total.totalRevenue, 200);
});

test("control-plane migration is additive and preserves existing stores with safe defaults", async () => {
  const sql = await readFile("src/drizzle/control-migrations/0004_faithful_wallflower.sql", "utf8");
  assert.match(sql, /CREATE TYPE "public"\."tenant_plan" AS ENUM\('small', 'medium', 'large'\)/);
  assert.match(sql, /ADD COLUMN "plan" "tenant_plan" DEFAULT 'small' NOT NULL/);
  assert.match(sql, /ADD COLUMN "featured" boolean DEFAULT false NOT NULL/);
  assert.match(sql, /tenants_featured_rank_positive/);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|TRUNCATE/);
});

test("route and mutation boundaries enforce server authorization and trusted schemas", async () => {
  const [layout, action, server, root] = await Promise.all([
    readFile("src/app/admin/layout.tsx", "utf8"),
    readFile("src/app/admin/_actions/stores.ts", "utf8"),
    readFile("src/lib/control-plane/server.ts", "utf8"),
    readFile("src/app/page.tsx", "utf8"),
  ]);
  assert.match(layout, /await requireSuperAdminPage\(\)/);
  assert.match(action, /updateControlPlaneStore/);
  assert.match(server, /await requireSuperAdmin\(\)/);
  assert.match(server, /hasValidTenantIdentity\(existing\)/);
  assert.match(server, /getDbForTenant\(tenant\)/);
  assert.match(server, /unsupportedCurrencyCount/);
  assert.match(server, /Cannot aggregate mixed currencies/);
  assert.doesNotMatch(server, /sql\.raw|schemaName.*formData|tenantSlug.*formData/);
  assert.match(root, /PlatformHomePage/);
  assert.doesNotMatch(root, /TenantLink|CartProvider|StorefrontPageHeader/);
  assert.doesNotMatch(root, /getCurrentAdminSession|authorizeSuperAdmin|redirect\(["']\/admin/);
});

test("merchant auth migration is additive and control-plane only", async () => {
  const sql = await readFile("src/drizzle/control-migrations/0006_merchant_identity.sql", "utf8");
  assert.match(sql, /CREATE TYPE "public"\."merchant_status" AS ENUM\('active', 'disabled'\)/);
  assert.match(sql, /CREATE TABLE "merchant_accounts"/);
  assert.match(sql, /CREATE TABLE "merchant_sessions"/);
  assert.match(sql, /CREATE TABLE "merchant_password_reset_tokens"/);
  assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM|TRUNCATE|search_path|tenant_/);
});

test("merchant migration is registered in the Drizzle journal", async () => {
  const journal = JSON.parse(
    await readFile("src/drizzle/control-migrations/meta/_journal.json", "utf8")
  );
  const entry = journal.entries.find(
    (candidate: { tag?: string }) => candidate.tag === "0006_merchant_identity"
  );
  assert.ok(entry);
  assert.equal(entry.idx, 6);
  assert.equal(entry.version, "7");
  assert.equal(entry.breakpoints, true);
});

test("organization migration is additive, control-plane only, and future-ready", async () => {
  const sql = await readFile(
    "src/drizzle/control-migrations/0007_organization_business.sql",
    "utf8"
  );

  assert.match(sql, /CREATE TABLE "organizations"/);
  assert.match(sql, /"display_name" varchar\(160\) NOT NULL/);
  assert.match(sql, /"country" varchar\(2\) DEFAULT 'IL' NOT NULL/);
  assert.match(sql, /CREATE TABLE "organization_memberships"/);
  assert.match(sql, /"merchant_account_id" integer NOT NULL/);
  assert.match(sql, /"organization_id" integer NOT NULL/);
  assert.match(sql, /"role" varchar\(32\) DEFAULT 'owner' NOT NULL/);
  assert.match(
    sql,
    /PRIMARY KEY\("organization_id","merchant_account_id"\)|PRIMARY KEY\("merchant_account_id","organization_id"\)/
  );
  assert.doesNotMatch(
    sql,
    /UNIQUE[^\n]*display_name|DROP TABLE|DELETE FROM|TRUNCATE|search_path/
  );
});

test("organization migration is registered after merchant identity", async () => {
  const journal = JSON.parse(
    await readFile("src/drizzle/control-migrations/meta/_journal.json", "utf8")
  );
  const entry = journal.entries.find(
    (candidate: { tag?: string }) =>
      candidate.tag === "0007_organization_business"
  );
  assert.ok(entry);
  assert.equal(entry.idx, 7);
  assert.equal(entry.version, "7");
  assert.equal(entry.breakpoints, true);
});

function store(slug: string, schemaName: string, displayName: string): ControlPlaneStore {
  return {
    id: 1,
    slug,
    schemaName,
    displayName,
    status: "active",
    plan: "small",
    featured: false,
    featuredRank: null,
    supportNotes: null,
    suspendedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
  };
}


test("Store migration remains control-plane only and preserves Organization migration history", async () => {
  const [storeSql, organizationSql] = await Promise.all([
    readFile("src/drizzle/control-migrations/0008_store_onboarding.sql", "utf8"),
    readFile("src/drizzle/control-migrations/0007_organization_business.sql", "utf8"),
  ]);

  assert.doesNotMatch(storeSql, /search_path|DROP SCHEMA|TRUNCATE/);
  assert.match(organizationSql, /CREATE TABLE "organizations"/);
  assert.doesNotMatch(organizationSql, /DROP TABLE|DELETE FROM|TRUNCATE|search_path/);
});


test("merchant custom-domain migration adds lifecycle and cooldown state", async () => {
  const [migration, domainSchema, claimSchema] = await Promise.all([
    readFile(
      "src/drizzle/control-migrations/0015_merchant_custom_domain_lifecycle.sql",
      "utf8"
    ),
    readFile("src/drizzle/control-schema/storeDomain.ts", "utf8"),
    readFile("src/drizzle/control-schema/storeDomainClaim.ts", "utf8"),
  ]);

  assert.match(migration, /"last_txt_check_at" timestamp with time zone/);
  assert.match(migration, /"last_cname_check_at" timestamp with time zone/);
  assert.match(migration, /"cname_verified_at" timestamp with time zone/);
  assert.match(migration, /"lifecycle_role" varchar\(32\)/);
  assert.match(migration, /"last_manual_check_at" timestamp with time zone/);
  assert.match(migration, /"retire_at" timestamp with time zone/);
  assert.match(migration, /"redirect_to_domain_id" integer/);
  assert.match(migration, /multiple active custom domains/i);
  assert.match(domainSchema, /"candidate".*"primary".*"retiring"/s);
  assert.match(claimSchema, /lastTxtCheckAt/);
  assert.match(claimSchema, /lastCnameCheckAt/);
});

test("domain hostname uniqueness is partial so a removed hostname can be reused", async () => {
  const [migration, schema] = await Promise.all([
    readFile(
      "src/drizzle/control-migrations/0015_merchant_custom_domain_lifecycle.sql",
      "utf8"
    ),
    readFile("src/drizzle/control-schema/storeDomain.ts", "utf8"),
  ]);

  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS "store_domains_hostname_unique"/
  );
  assert.match(migration, /store_domains_hostname_bound_unique/);
  assert.match(migration, /WHERE "status" <> 'removed'/);
  assert.doesNotMatch(
    schema,
    /hostname: varchar\("hostname", \{ length: 253 \}\)\.notNull\(\)\.unique\(\)/
  );
});
