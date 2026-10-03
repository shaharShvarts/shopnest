import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
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

test("unauthenticated and tenant admins cannot change store control-plane settings", () => {
  assert.throws(() => authorizeStoreMutation(null, mutation), { code: "FORBIDDEN" });
  assert.throws(
    () => authorizeStoreMutation({ ...superAdmin, role: "tenant_admin", tenantSlugs: ["gift-shop"] }, mutation),
    { code: "FORBIDDEN" }
  );
});

test("store mutation no longer accepts a commercial plan field", () => {
  assert.equal(storeMutationSchema.safeParse(mutation).success, true);
  assert.equal(
    storeMutationSchema.safeParse({ ...mutation, featured: false, featuredRank: 1 }).success,
    false
  );

  const parsed = storeMutationSchema.parse({
    ...mutation,
    plan: "enterprise",
  });
  assert.equal(Object.prototype.hasOwnProperty.call(parsed, "plan"), false);
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
    resolveTrustedStore({ ...stores[0], tenantStatus: "suspended" }),
    null
  );
  assert.equal(
    resolveTrustedStore({ ...stores[0], tenantStatus: "disabled" }),
    null
  );
});

test("draft Stores remain visible but never select a tenant database", async () => {
  const draft: ControlPlaneStore = {
    ...stores[0],
    storeId: 99,
    slug: "draft-shop",
    displayName: "Draft Shop",
    storeStatus: "draft",
    tenantId: null,
    tenantSlug: null,
    schemaName: null,
    tenantStatus: null,
    plan: null,
    subscriptionPlanCode: "free",
    subscriptionPlanName: "Free",
  };

  assert.equal(resolveTrustedStore(draft), null);

  let metricCalls = 0;
  const [summary] = await buildStoreSummaries([draft], async () => {
    metricCalls += 1;
    throw new Error("Draft Store must not query a tenant database");
  });

  assert.equal(metricCalls, 0);
  assert.equal(summary.kind, "unavailable");
  if (summary.kind === "unavailable") {
    assert.equal(summary.reason, "not_provisioned");
  }

  assert.deepEqual(summarizePlatform([summary]), {
    registeredStores: 1,
    activeStores: 0,
    unavailableStores: 0,
    totalOrders: 0,
    totalRevenue: 0,
    ordersToday: 0,
    revenueToday: 0,
    complete: true,
    failedStores: [],
  });
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
  assert.match(server, /\.from\(stores\)/);
  assert.match(server, /eq\(controlPlaneTenants\.id, stores\.tenantId\)/);
  assert.match(server, /isNull\(stores\.deletedAt\)/);
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
    storeId: slug === "gift-shop" ? 1 : 2,
    slug,
    displayName,
    storeStatus: "provisioned",
    tenantId: slug === "gift-shop" ? 11 : 12,
    tenantSlug: slug,
    schemaName,
    tenantStatus: "active",
    plan: "small",
    subscriptionPlanCode: "small",
    subscriptionPlanName: "Small",
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


test("tenant plan snapshot migration accepts dynamic plan codes", async () => {
  const [migration, tenantSchema, actionSource, pageSource] = await Promise.all([
    readFile(
      "src/drizzle/control-migrations/0021_dynamic_tenant_plan_snapshot.sql",
      "utf8"
    ),
    readFile("src/drizzle/control-schema/tenant.ts", "utf8"),
    readFile("src/app/admin/_actions/stores.ts", "utf8"),
    readFile("src/app/admin/stores/[slug]/page.tsx", "utf8"),
  ]);

  assert.match(migration, /ALTER COLUMN "plan" TYPE varchar\(64\)/);
  assert.match(tenantSchema, /plan: varchar\("plan", \{ length: 64 \}\)/);
  assert.doesNotMatch(actionSource, /formData\.get\("plan"\)/);
  assert.doesNotMatch(pageSource, /name="plan"/);
});


test("Super Admin Store table uses subscription plan instead of Tenant snapshot", async () => {
  const [serverSource, tableSource] = await Promise.all([
    readFile("src/lib/control-plane/server.ts", "utf8"),
    readFile("src/app/admin/_components/StoreTable.tsx", "utf8"),
  ]);

  assert.match(serverSource, /subscriptionPlanCode:\s*plans\.code/);
  assert.match(serverSource, /subscriptionPlanName:\s*plans\.name/);
  assert.match(serverSource, /leftJoin\(subscriptions/);
  assert.match(serverSource, /leftJoin\(plans/);
  assert.match(tableSource, /store\.subscriptionPlanName/);
  assert.doesNotMatch(tableSource, /t\(store\.plan\)/);
});


test("schema code no longer defines the legacy tenant plan enum", async () => {
  const sharedSource = await readFile(
    "src/drizzle/control-schema/shared.ts",
    "utf8"
  );

  assert.doesNotMatch(sharedSource, /tenantPlanEnum|tenantPlans|type TenantPlan/);
});


test("management Button size and Plans form use the shared 44px controls", async () => {
  const [button, plans, priceInput, integerInput] = await Promise.all([
    readFile("src/components/ui/button.tsx", "utf8"),
    readFile("src/app/admin/plans/page.tsx", "utf8"),
    readFile("src/app/admin/plans/PlanPriceInput.tsx", "utf8"),
    readFile("src/app/admin/plans/EntitlementIntegerInput.tsx", "utf8"),
  ]);

  assert.match(button, /management:\s*"h-11 rounded-lg/);
  assert.match(plans, /ManagementInput/);
  assert.match(plans, /size="management"/);
  assert.doesNotMatch(plans, /<input\\b[^>]*\\bname="(?:code|name)"[^>]*>/);
  assert.match(priceInput, /<ManagementInput/);
  assert.doesNotMatch(priceInput, /className="min-h-11/);
  assert.match(
    plans,
    /md:grid-cols-\[minmax\(0,1fr\)_minmax\(220px,max-content\)_auto\]/
  );
  assert.match(integerInput, /className="flex h-11 min-w-28 items-stretch overflow-hidden rounded-lg/);
  assert.match(integerInput, /whitespace-nowrap tabular-nums/);
  assert.match(integerInput, /<Button[\s\S]*?variant="outline"[\s\S]*?size="management"/);
  assert.match(integerInput, /className="shrink-0 px-3 text-sm text-blue-700"/);
  assert.doesNotMatch(integerInput, /space-y-1/);
  assert.doesNotMatch(plans, /self-start border-red-200/);
});

test("Control Plane remaining Wave 1 surfaces follow management UI standards", async () => {
  const [loginForm, loginPage, storeTable, featuredPage] = await Promise.all([
    readFile("src/app/[tenant]/admin/_components/AdminLoginForm.tsx", "utf8"),
    readFile("src/app/admin/login/page.tsx", "utf8"),
    readFile("src/app/admin/_components/StoreTable.tsx", "utf8"),
    readFile("src/app/admin/featured/page.tsx", "utf8"),
  ]);

  assert.match(loginForm, /ManagementInput/);
  assert.doesNotMatch(loginForm, /<input\\b/);
  assert.match(loginForm, /size="management"/);
  assert.match(loginPage, /rounded-xl border border-slate-200 bg-white/);
  assert.match(storeTable, /overflow-x-auto/);
  assert.match(storeTable, /focus-visible:ring-2/);
  assert.match(featuredPage, /focus-visible:ring-2/);
});

test("Control Plane shell uses 44px shared utility controls and keyboard focus", async () => {
  const [layout, languageSelector, navigation] = await Promise.all([
    readFile("src/app/admin/layout.tsx", "utf8"),
    readFile("src/app/components/LanguageSelector.tsx", "utf8"),
    readFile("src/app/admin/_components/AdminNavigation.tsx", "utf8"),
  ]);

  assert.match(layout, /size="management"/);
  assert.doesNotMatch(layout, /className="h-10/);
  assert.match(languageSelector, /size="management"/);
  assert.doesNotMatch(languageSelector, /className="h-10/);
  assert.match(navigation, /min-h-11/);
  assert.match(navigation, /focus-visible:ring-2/);
});

test("Control Plane same-page mutations use the shared in-place interaction", async () => {
  const [mutation, planActions, plansPage, storeActions, storePage] =
    await Promise.all([
      readFile("src/components/management/ManagementMutation.tsx", "utf8"),
      readFile("src/app/admin/_actions/plans.ts", "utf8"),
      readFile("src/app/admin/plans/page.tsx", "utf8"),
      readFile("src/app/admin/_actions/stores.ts", "utf8"),
      readFile("src/app/admin/stores/[slug]/page.tsx", "utf8"),
    ]);

  assert.match(mutation, /event\.preventDefault\(\)/);
  assert.match(mutation, /useTransition/);
  assert.match(mutation, /router\.refresh\(\)/);
  assert.match(mutation, /from "react-toastify"/);
  assert.match(mutation, /toast\.success|toast\.error/);
  assert.doesNotMatch(mutation, /fixed inset-x-4 top-4|basis-full|col-span-full/);
  assert.doesNotMatch(mutation, /router\.push|router\.replace|window\.location/);

  assert.match(plansPage, /ManagementMutationForm/);
  assert.match(plansPage, /ManagementMutationButton/);
  assert.doesNotMatch(plansPage, /formAction=\{removePlanEntitlementAction/);
  assert.doesNotMatch(planActions, /next\/navigation/);
  assert.doesNotMatch(planActions, /redirect\(/);

  assert.match(storePage, /ManagementMutationForm/);
  assert.doesNotMatch(storeActions, /next\/navigation/);
  assert.doesNotMatch(storeActions, /redirect\(/);
});

test("application toasts use the installed react-toastify provider", async () => {
  const relativeFiles = (await readdir("src", { recursive: true }))
    .filter((path) => /\.(?:ts|tsx|js|jsx)$/.test(path))
    .map((path) => `src/${path}`);

  const sources = await Promise.all(
    relativeFiles.map(async (path) => ({
      path,
      source: await readFile(path, "utf8"),
    }))
  );

  const toastContainers = sources
    .filter(({ source }) => /<ToastContainer\b/.test(source))
    .map(({ path }) => path);

  assert.deepEqual(toastContainers, ["src/app/components/ToastProvider.tsx"]);

  for (const { path, source } of sources) {
    if (/\btoast\.(?:success|error|info|warning|warn|loading|promise|dismiss|update)\b/.test(source)) {
      assert.match(
        source,
        /from ["']react-toastify["']/,
        `${path} uses toast feedback without react-toastify`
      );
    }
  }

  const managementMutation = sources.find(
    ({ path }) => path === "src/components/management/ManagementMutation.tsx"
  )?.source ?? "";

  assert.match(managementMutation, /from "react-toastify"/);
  assert.doesNotMatch(
    managementMutation,
    /fixed inset-x-4 top-4|z-\[100\].*rounded-lg.*shadow-lg/
  );
});

test("Control Plane store settings use shared management controls", async () => {
  const [page, input, select, textarea] = await Promise.all([
    readFile("src/app/admin/stores/[slug]/page.tsx", "utf8"),
    readFile("src/components/management/ManagementInput.tsx", "utf8"),
    readFile("src/components/management/ManagementSelect.tsx", "utf8"),
    readFile("src/components/management/ManagementTextarea.tsx", "utf8"),
  ]);

  assert.match(page, /ManagementInput/);
  assert.match(page, /ManagementSelect/);
  assert.match(page, /ManagementTextarea/);
  assert.doesNotMatch(page, /<select\b/);
  assert.match(page, /<Button asChild variant="outline" size="management">/);
  assert.match(input, /"h-11 w-full/);
  assert.match(select, /"h-11 w-full appearance-none/);
  assert.match(textarea, /"min-h-28 w-full/);
});
