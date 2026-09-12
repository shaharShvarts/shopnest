import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { AdminPrincipal } from "../src/lib/admin-auth/core.ts";
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
} from "../src/lib/control-plane/core.ts";

const stores: ControlPlaneStore[] = [
  store("gift-shop", "gift_shop", "Gift Shop"),
  store("panda-pop", "panda_pop", "Panda Pop"),
];
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

  const tenantAdmin = resolveTenantRoute("/gift-shop/admin");
  assert.equal(tenantAdmin.kind, "tenant");
  if (tenantAdmin.kind === "tenant") {
    assert.equal(tenantAdmin.internalPath, "/admin");
    assert.equal(isTenantAdminPath(tenantAdmin.internalPath), true);
  }

  const tenantLogin = resolveTenantRoute("/gift-shop/admin/login");
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

test("registered tenants are retained and unknown detail lookups fail closed", () => {
  assert.deepEqual(stores.map((store) => store.slug), ["gift-shop", "panda-pop"]);
  assert.equal(findTrustedStore(stores, "gift-shop")?.schemaName, "gift_shop");
  assert.equal(findTrustedStore(stores, "unknown-store"), null);
});

test("browser supplied schemas cannot select an arbitrary schema", () => {
  assert.equal(resolveTrustedStore(store("gift-shop", "attacker_schema", "Spoofed")), null);
  assert.equal(resolveTrustedStore(store("unknown-store", "gift_shop", "Spoofed")), null);
  assert.equal(resolveTrustedStore(stores[0])?.schema, "gift_shop");
});

test("aggregation uses each validated tenant result without cross-tenant attribution", async () => {
  const summaries = await buildStoreSummaries(stores, async (tenant) =>
    tenant.slug === "gift-shop"
      ? { orderCount: 2, salesVolume: 200, ordersToday: 1, revenueToday: 80, lastActivity: new Date("2026-09-10T08:00:00Z") }
      : { orderCount: 9, salesVolume: 900, ordersToday: 3, revenueToday: 300, lastActivity: null }
  );
  assert.equal(summaries[0].kind === "available" && summaries[0].metrics.orderCount, 2);
  assert.equal(summaries[1].kind === "available" && summaries[1].metrics.orderCount, 9);
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

test("one tenant failure produces an explicit partial total without misattribution", async () => {
  const summaries = await buildStoreSummaries(stores, async (tenant) => {
    if (tenant.slug === "panda-pop") throw new Error("tenant unavailable");
    return { orderCount: 2, salesVolume: 200, ordersToday: 1, revenueToday: 80, lastActivity: null };
  });
  assert.equal(summaries[1].kind, "unavailable");
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
    readFile("src/app/(customer)/page.tsx", "utf8"),
  ]);
  assert.match(layout, /await requireSuperAdminPage\(\)/);
  assert.match(action, /updateControlPlaneStore/);
  assert.match(server, /await requireSuperAdmin\(\)/);
  assert.match(server, /resolveTrustedStore\(existing\)/);
  assert.match(server, /getDbForTenant\(tenant\)/);
  assert.match(server, /unsupportedCurrencyCount/);
  assert.match(server, /Cannot aggregate mixed currencies/);
  assert.doesNotMatch(server, /sql\.raw|schemaName.*formData|tenantSlug.*formData/);
  assert.match(root, /<StorefrontPageHeader>Home Page<\/StorefrontPageHeader>/);
  assert.doesNotMatch(root, /getCurrentAdminSession|authorizeSuperAdmin|redirect\(["']\/admin/);
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
