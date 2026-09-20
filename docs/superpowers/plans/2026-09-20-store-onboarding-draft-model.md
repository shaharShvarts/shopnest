# Store Onboarding / Draft Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Organization-owned Store model and merchant onboarding UI, with globally unique requested slugs, fail-closed ownership, 10-second soft-delete Undo, and no Tenant/schema provisioning.

**Architecture:** Add `public.stores` as a control-plane entity between Organization and Tenant, with optional unique `tenant_id`, lifecycle constraints, and partial slug uniqueness that retains deleted Store history. Put validation and Store operations behind a focused `merchant-stores` domain/repository boundary; merchant pages/actions derive authority only from the verified merchant session plus Organization owner membership. Remove the three obsolete static tenant slugs so Store creation stays separate from routing until later provisioning/dynamic-registry work.

**Tech Stack:** Next.js 15 App Router, TypeScript, React 19, PostgreSQL 17, Drizzle ORM, Zod, next-intl, react-toastify, Node test runner.

**Spec:** `docs/superpowers/specs/2026-09-20-store-onboarding-draft-model-design.md`

## Global Constraints

- Domain chain: Merchant Account → Organization Membership → Organization / Business → Store → Tenant → PostgreSQL schema.
- One Organization may own multiple Stores; PR #37 has no `store_memberships`.
- Store may exist with `tenant_id = NULL` and every new Store starts `draft`.
- Lifecycle values are exactly `draft`, `ready_for_provisioning`, `provisioned`.
- PR #37 exposes no user action for `ready_for_provisioning` and performs no Tenant/schema provisioning.
- `provisioned` requires a Tenant; `draft` and `ready_for_provisioning` require no Tenant in PR #37.
- Store `display_name` is merchant-facing source of truth; do not dual-write Tenant `display_name`.
- Store slugs are globally unique while reserved, lowercase ASCII letters/digits with hyphen-separated segments, max 63 chars.
- System-reserved route names can never be Store slugs.
- Slug suggestion is ASCII-only/deterministic; Hebrew-only names are not transliterated and require manual slug.
- Slug editable before Tenant linkage and locked after Tenant linkage.
- Normal delete allowed only with `tenant_id IS NULL`; delete is soft and Undo lasts exactly 10 seconds.
- Deleted Store history is retained; no hard delete, Trash UI, or background finalizer in PR #37.
- Slug remains reserved during Undo and is reusable only after opportunistic finalization.
- Mutation concurrency uses `updated_at` as optimistic concurrency token.
- Browser fields are never authority for merchant, Organization, Tenant, schema, role, status, or Store ownership.
- Store operations use only the public control plane and never tenant-schema DB helpers.
- Remove `panda-pop`, `gift-shop`, `dvorik-collection` from static trusted tenant registry.
- Creating Store never makes a storefront routable.
- Never rewrite historical migrations.
- Legacy seed cleanup never drops schemas or cascade-deletes live references.
- DEV/STAGING reset happened separately; implementation must not repeat destructive reset.
- Production deployment/reset is outside PR #37.
- Do not use `docker compose down -v`.
- Merge only after explicit approval plus green GitHub Actions and production build.

## Review Focus

- ` ADMIN ` must normalize before reserved-name checking and be rejected.
- Hebrew-only/punctuation-only display names must produce empty automatic slug suggestion and require manual slug.
- Same-slug races must never create two reserved Stores; partial unique index is final authority.
- Malformed/stale `updated_at` tokens must never mutate or revive Store state.
- Legacy tenant with its schema or any known dependent control-plane row must survive cleanup.

## File Map

**Create**
- `src/drizzle/control-schema/store.ts`
- `src/drizzle/control-migrations/0008_store_onboarding.sql`
- `src/lib/merchant-stores/core.ts`
- `src/lib/merchant-stores/drizzle-repository.ts`
- `src/lib/merchant-stores/server.ts`
- `src/app/(merchant)/dashboard/stores/_actions.ts`
- `src/app/(merchant)/dashboard/stores/_components/StoreForm.tsx`
- `src/app/(merchant)/dashboard/stores/_components/StoreList.tsx`
- `src/app/(merchant)/dashboard/stores/page.tsx`
- `src/app/(merchant)/dashboard/stores/new/page.tsx`
- `src/app/(merchant)/dashboard/stores/[id]/page.tsx`
- `src/app/(merchant)/dashboard/stores/[id]/edit/page.tsx`
- `tests/merchant-store.test.mts`
- `tests/merchant-store-routes.test.mts`

**Modify**
- `src/drizzle/control-schema/shared.ts`
- `src/drizzle/control-plane-schema.ts`
- `src/drizzle/control-migrations/meta/_journal.json`
- `src/lib/tenant-routing/core.ts`
- `src/lib/tenant-validation.mjs`
- `tests/tenant-provisioning.test.mjs`
- `tests/tenant.test.mts`
- `tests/route-navigation.test.mjs`
- `tests/control-plane.test.mts`
- `src/app/(merchant)/dashboard/page.tsx`
- `src/messages/en.json`
- `src/messages/he.json`
- `docs/route-audit.md`
- `package.json`
- `.github/workflows/ci.yml`

---

### Task 1: Store schema, lifecycle constraints, and guarded legacy cleanup

**Files:**
- Create: `src/drizzle/control-schema/store.ts`
- Modify: `src/drizzle/control-schema/shared.ts`
- Modify: `src/drizzle/control-plane-schema.ts`
- Create: `src/drizzle/control-migrations/0008_store_onboarding.sql`
- Modify: `src/drizzle/control-migrations/meta/_journal.json`
- Create: `tests/merchant-store.test.mts`
- Modify: `tests/control-plane.test.mts`

**Interfaces:**
- Consumes: `organizations.id`, `controlPlaneTenants.id`.
- Produces: `stores`, `storeStatusEnum`, `StoreStatus` and DB lifecycle/uniqueness constraints.

- [ ] **Step 1: Write failing migration tests**

Create `tests/merchant-store.test.mts`:

~~~ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Store migration creates lifecycle and Store/Tenant boundary", async () => {
  const sql = await readFile(
    "src/drizzle/control-migrations/0008_store_onboarding.sql",
    "utf8"
  );
  assert.match(
    sql,
    /CREATE TYPE "public"\."store_status" AS ENUM\('draft', 'ready_for_provisioning', 'provisioned'\)/
  );
  assert.match(sql, /CREATE TABLE "stores"/);
  assert.match(sql, /"organization_id" integer NOT NULL/);
  assert.match(sql, /"display_name" varchar\(160\) NOT NULL/);
  assert.match(sql, /"slug" varchar\(63\) NOT NULL/);
  assert.match(sql, /"tenant_id" integer/);
  assert.match(sql, /stores_status_tenant_consistency/);
  assert.match(sql, /stores_delete_window_consistency/);
  assert.match(sql, /stores_slug_release_requires_delete/);
  assert.match(sql, /stores_slug_reserved_unique/);
  assert.match(sql, /WHERE "slug_released_at" IS NULL/);
  assert.match(sql, /stores_tenant_id_unique/);
  assert.doesNotMatch(sql, /DROP SCHEMA|DROP TABLE|TRUNCATE/);
});

test("legacy cleanup is exact and guarded against live data", async () => {
  const sql = await readFile(
    "src/drizzle/control-migrations/0008_store_onboarding.sql",
    "utf8"
  );
  for (const [slug, schema] of [
    ["panda-pop", "panda_pop"],
    ["gift-shop", "gift_shop"],
    ["dvorik-collection", "dvorik_collection"],
  ]) {
    assert.match(sql, new RegExp(slug));
    assert.match(sql, new RegExp(schema));
  }
  assert.match(sql, /pg_namespace/);
  assert.match(sql, /admin_user_tenants/);
  assert.match(sql, /customer_tenants/);
  assert.match(sql, /customer_oauth_transactions/);
  assert.match(sql, /RAISE NOTICE/);
  assert.doesNotMatch(sql, /DROP SCHEMA/);
});

test("Store migration is journaled after Organization migration", async () => {
  const journal = JSON.parse(
    await readFile("src/drizzle/control-migrations/meta/_journal.json", "utf8")
  );
  const entry = journal.entries.find(
    (candidate: { tag?: string }) => candidate.tag === "0008_store_onboarding"
  );
  assert.ok(entry);
  assert.equal(entry.idx, 8);
  assert.equal(entry.version, "7");
  assert.equal(entry.breakpoints, true);
});
~~~

Also add a `tests/control-plane.test.mts` assertion that migration 0008 contains no `search_path` and migration 0007 remains unchanged.

- [ ] **Step 2: Run focused tests and verify RED**

~~~bash
npx --yes tsx --test tests/merchant-store.test.mts tests/control-plane.test.mts
~~~

Expected: FAIL because migration/schema do not exist.

- [ ] **Step 3: Add Store status and Drizzle table**

Append to `shared.ts`:

~~~ts
export const storeStatuses = [
  "draft",
  "ready_for_provisioning",
  "provisioned",
] as const;
export type StoreStatus = (typeof storeStatuses)[number];
export const storeStatusEnum = pgEnum("store_status", storeStatuses);
~~~

Create `store.ts` with fields:
`id`, `organizationId`, `displayName`, `slug`, `status`, `tenantId`,
`deletedAt`, `deleteFinalizesAt`, `slugReleasedAt`, `createdAt`, `updatedAt`.

Use these exact table constraints:

~~~ts
check(
  "stores_status_tenant_consistency",
  sql`(
    (${table.status} = 'provisioned' AND ${table.tenantId} IS NOT NULL)
    OR
    (${table.status} IN ('draft', 'ready_for_provisioning') AND ${table.tenantId} IS NULL)
  )`
),
check(
  "stores_delete_window_consistency",
  sql`(
    (${table.deletedAt} IS NULL AND ${table.deleteFinalizesAt} IS NULL)
    OR
    (${table.deletedAt} IS NOT NULL AND ${table.deleteFinalizesAt} IS NOT NULL)
  )`
),
check(
  "stores_slug_release_requires_delete",
  sql`${table.slugReleasedAt} IS NULL OR ${table.deletedAt} IS NOT NULL`
),
check(
  "stores_delete_finalizes_after_delete",
  sql`${table.deleteFinalizesAt} IS NULL OR ${table.deleteFinalizesAt} >= ${table.deletedAt}`
),
uniqueIndex("stores_slug_reserved_unique")
  .on(table.slug)
  .where(sql`${table.slugReleasedAt} IS NULL`),
uniqueIndex("stores_tenant_id_unique")
  .on(table.tenantId)
  .where(sql`${table.tenantId} IS NOT NULL`),
index("stores_organization_id_idx").on(table.organizationId),
~~~

Organization/Tenant FKs use default NO ACTION; never add cascade. Export from `control-plane-schema.ts`.

- [ ] **Step 4: Add migration 0008 and guarded cleanup**

Use SQL equivalent of Step 3, then:

~~~sql
DO $$
DECLARE
  legacy_slug text;
  legacy_schema text;
BEGIN
  FOR legacy_slug, legacy_schema IN
    SELECT *
    FROM (
      VALUES
        ('panda-pop', 'panda_pop'),
        ('gift-shop', 'gift_shop'),
        ('dvorik-collection', 'dvorik_collection')
    ) AS legacy(slug, schema_name)
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.tenants
      WHERE slug = legacy_slug AND schema_name = legacy_schema
    ) THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_namespace WHERE nspname = legacy_schema
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.admin_user_tenants WHERE tenant_slug = legacy_slug
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.customer_tenants WHERE tenant_slug = legacy_slug
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.customer_oauth_transactions WHERE tenant_slug = legacy_slug
      ) THEN
        DELETE FROM public.tenants
        WHERE slug = legacy_slug AND schema_name = legacy_schema;
      ELSE
        RAISE NOTICE
          'Leaving legacy tenant % because schema or dependent control-plane data still exists',
          legacy_slug;
      END IF;
    END IF;
  END LOOP;
END $$;
~~~

Register journal entry:

~~~json
{
  "idx": 8,
  "version": "7",
  "when": 1790035200000,
  "tag": "0008_store_onboarding",
  "breakpoints": true
}
~~~

Do not run Drizzle generation; current control migration history is manually maintained beyond older snapshots.

- [ ] **Step 5: Verify GREEN and commit**

~~~bash
npx --yes tsx --test tests/merchant-store.test.mts tests/control-plane.test.mts
git add src/drizzle/control-schema/shared.ts src/drizzle/control-schema/store.ts \
  src/drizzle/control-plane-schema.ts \
  src/drizzle/control-migrations/0008_store_onboarding.sql \
  src/drizzle/control-migrations/meta/_journal.json \
  tests/merchant-store.test.mts tests/control-plane.test.mts
git commit -m "feat: add store control-plane model"
~~~

Expected: tests PASS before commit.

---

### Task 2: Slug policy and legacy static registry cleanup

**Files:**
- Create: `src/lib/merchant-stores/core.ts`
- Modify: `src/lib/tenant-routing/core.ts`
- Modify: `src/lib/tenant-validation.mjs`
- Modify: `tests/merchant-store.test.mts`
- Modify: `tests/tenant-provisioning.test.mjs`
- Modify: `tests/tenant.test.mts`
- Modify: `tests/route-navigation.test.mjs`
- Modify: `tests/control-plane.test.mts`

**Interfaces:**
- Produces `STORE_DELETE_UNDO_MS`, `storeProfileSchema`, `parseStoreProfile`,
  `suggestStoreSlug`, `parseStoreId`, `parseStoreVersion`,
  `STORE_RESERVED_ROUTE_SEGMENTS` and `TenantResolver`.

- [ ] **Step 1: Add failing slug tests**

~~~ts
import {
  STORE_DELETE_UNDO_MS,
  parseStoreProfile,
  parseStoreVersion,
  suggestStoreSlug,
} from "../src/lib/merchant-stores/core.ts";

test("slug normalization happens before reserved checking", () => {
  assert.deepEqual(
    parseStoreProfile({ displayName: "Panda Pop", slug: " PANDA-POP " }),
    { displayName: "Panda Pop", slug: "panda-pop" }
  );
  for (const slug of [" ADMIN ", "login", "api", "media", "_next", "static"]) {
    assert.throws(
      () => parseStoreProfile({ displayName: "Store", slug }),
      /invalid_store_profile/
    );
  }
});

test("slug suggestion is deterministic ASCII-only", () => {
  assert.equal(suggestStoreSlug("Panda Pop"), "panda-pop");
  assert.equal(suggestStoreSlug("  Panda   Pop!  "), "panda-pop");
  assert.equal(suggestStoreSlug("פנדה פופ"), "");
  assert.equal(suggestStoreSlug("פנדה Panda פופ Pop"), "panda-pop");
  assert.match(suggestStoreSlug("A".repeat(100)), /^[a-z0-9-]{1,63}$/);
});

test("profile strips authority fields and rejects malformed slugs", () => {
  for (const slug of ["", "-panda", "panda-", "panda--pop", "panda pop", "פנדה"]) {
    assert.throws(
      () => parseStoreProfile({ displayName: "Store", slug }),
      /invalid_store_profile/
    );
  }
  assert.deepEqual(
    parseStoreProfile({
      displayName: "Store",
      slug: "safe-store",
      merchantAccountId: 9,
      organizationId: 9,
      tenantId: 9,
      schemaName: "public",
      status: "provisioned",
      role: "owner",
    }),
    { displayName: "Store", slug: "safe-store" }
  );
});

test("Store version must be valid ISO time", () => {
  assert.equal(
    parseStoreVersion("2026-09-20T10:00:00.000Z").toISOString(),
    "2026-09-20T10:00:00.000Z"
  );
  for (const value of ["", "yesterday", "2026-99-99", null, 123]) {
    assert.throws(() => parseStoreVersion(value), /invalid_store_version/);
  }
  assert.equal(STORE_DELETE_UNDO_MS, 10_000);
});
~~~

Change tenant tests so all three old slugs resolve to null and default routing returns not-found.

- [ ] **Step 2: Run and verify RED**

~~~bash
npx --yes tsx --test tests/merchant-store.test.mts tests/tenant.test.mts \
  tests/route-navigation.test.mjs tests/control-plane.test.mts
node --test tests/tenant-provisioning.test.mjs
~~~

Expected: FAIL.

- [ ] **Step 3: Centralize reserved route sets**

In `tenant-routing/core.ts`:

~~~ts
export const GLOBAL_PAGE_ROUTE_SEGMENTS = Object.freeze([
  "admin",
  "features",
  "pricing",
  "examples",
  "faq",
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "dashboard",
] as const);

export const LEGACY_ROUTE_SEGMENTS = new Set<string>(
  GLOBAL_PAGE_ROUTE_SEGMENTS
);

export const STORE_RESERVED_ROUTE_SEGMENTS = new Set<string>([
  ...GLOBAL_PAGE_ROUTE_SEGMENTS,
  "api",
  "media",
  "static",
  "_next",
]);
~~~

Add resolver injection while preserving every existing safety branch:

~~~ts
export type TenantResolver = (value: unknown) => Tenant | null;

export function resolveTenantRoute(
  pathname: string,
  resolveTenant: TenantResolver = resolveConfiguredTenant
): TenantRouteResolution {
  const [firstSegment, ...rest] = pathname.split("/").filter(Boolean);

  if (
    !firstSegment ||
    LEGACY_ROUTE_SEGMENTS.has(firstSegment) ||
    GLOBAL_API_PATHS.has(pathname.replace(/\/$/, ""))
  ) {
    return { kind: "legacy" };
  }

  const tenant = resolveTenant(firstSegment);
  if (!tenant) return { kind: "not-found" };
  if (GLOBAL_API_PATHS.has("/" + rest.join("/"))) return { kind: "not-found" };

  return {
    kind: "tenant",
    tenant,
    internalPath: rest.length === 0 ? "/" : "/" + rest.join("/"),
  };
}

export function prefixTenantPath(
  path: string,
  basePath: string,
  resolveTenant: TenantResolver = resolveConfiguredTenant
) {
  const tenant = resolveTenant(basePath.slice(1));
  if (!tenant || tenant.basePath !== basePath) {
    throw new Error("Tenant navigation requires a configured tenant");
  }
  if (path.startsWith("#") || path.startsWith("?")) return path;
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(path) ||
    /%2f|%5c/i.test(path.split(/[?#]/)[0])
  ) {
    throw new Error("Tenant navigation requires a local absolute path");
  }
  const url = new URL(path, "https://shopnest.invalid");
  const decoded = decodeURIComponent(url.pathname);
  if (
    decoded.includes("\\") ||
    decoded.split("/").some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error("Unsafe tenant navigation path");
  }
  const first = decoded.split("/")[1];
  const targetTenant = resolveTenant(first);
  if (targetTenant && targetTenant.slug !== tenant.slug) {
    throw new Error("Cross-tenant navigation is not allowed");
  }
  if (targetTenant) return url.pathname + url.search + url.hash;
  return basePath + (url.pathname === "/" ? "" : url.pathname) + url.search + url.hash;
}
~~~

Do not use Store-reserved set as legacy routing set.

- [ ] **Step 4: Create Store core**

~~~ts
import { z } from "zod";
import { STORE_RESERVED_ROUTE_SEGMENTS } from "@/lib/tenant-routing/core";
import { normalizeTenantSlug } from "@/lib/tenant-validation.mjs";

export const STORE_DELETE_UNDO_MS = 10_000;

const storeSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(63)
  .transform((value) => value.toLowerCase())
  .superRefine((value, context) => {
    const normalized = normalizeTenantSlug(value);
    if (!normalized || normalized.slug !== value) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "invalid_store_slug" });
      return;
    }
    if (STORE_RESERVED_ROUTE_SEGMENTS.has(value)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "reserved_store_slug" });
    }
  });

export const storeProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160),
    slug: storeSlugSchema,
  })
  .strip();

export type StoreProfile = z.infer<typeof storeProfileSchema>;
export type MerchantStoreStatus =
  | "draft"
  | "ready_for_provisioning"
  | "provisioned";

export type MerchantStore = {
  id: number;
  organizationId: number;
  displayName: string;
  slug: string;
  status: MerchantStoreStatus;
  tenantId: number | null;
  deletedAt: Date | null;
  deleteFinalizesAt: Date | null;
  slugReleasedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function parseStoreProfile(input: unknown): StoreProfile {
  const parsed = storeProfileSchema.safeParse(input);
  if (!parsed.success) throw new Error("invalid_store_profile");
  return parsed.data;
}

export function suggestStoreSlug(displayName: string) {
  const parts = displayName.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return parts.join("-").slice(0, 63).replace(/-+$/g, "");
}

export function parseStoreId(value: unknown) {
  const parsed = z.coerce.number().int().positive().safeParse(value);
  if (!parsed.success) throw new Error("invalid_store_id");
  return parsed.data;
}

export function parseStoreVersion(value: unknown) {
  const parsed = z.string().datetime({ offset: true }).safeParse(value);
  if (!parsed.success) throw new Error("invalid_store_version");
  const date = new Date(parsed.data);
  if (Number.isNaN(date.getTime())) throw new Error("invalid_store_version");
  return date;
}
~~~

- [ ] **Step 5: Remove old static slugs and adapt regression tests**

In `tenant-validation.mjs`:

~~~js
export const CONFIGURED_TENANT_SLUGS = Object.freeze([]);
~~~

In routing tests define:

~~~js
function resolveFixtureTenant(value) {
  const tenant = normalizeTenantSlug(value);
  return tenant?.slug === "fixture-store" ? tenant : null;
}
~~~

Use injected resolver only for pure positive route/path-builder tests. Actual middleware/default routing must 404 the old slugs. Update control-plane tests so old Tenant rows are untrusted, and test `summarizePlatform` with explicit summaries instead of pretending a runtime Tenant is configured.

- [ ] **Step 6: Verify GREEN and commit**

~~~bash
npx --yes tsx --test tests/merchant-store.test.mts tests/tenant.test.mts \
  tests/route-navigation.test.mjs tests/control-plane.test.mts
node --test tests/tenant-provisioning.test.mjs
git add src/lib/merchant-stores/core.ts src/lib/tenant-routing/core.ts \
  src/lib/tenant-validation.mjs tests/merchant-store.test.mts \
  tests/tenant-provisioning.test.mjs tests/tenant.test.mts \
  tests/route-navigation.test.mjs tests/control-plane.test.mts
git commit -m "refactor: separate store slugs from tenant routing"
~~~

Expected: tests PASS before commit.

---

### Task 3: Owner-scoped Store repository and concurrency-safe lifecycle

**Files:**
- Modify: `src/lib/merchant-stores/core.ts`
- Create: `src/lib/merchant-stores/drizzle-repository.ts`
- Create: `src/lib/merchant-stores/server.ts`
- Modify: `tests/merchant-store.test.mts`

**Interfaces:**
- Produces `MerchantStoreRepository`, `MerchantStoreError`,
  `DrizzleMerchantStoreRepository` and `getMerchantStoreRepository()`.

- [ ] **Step 1: Add failing repository boundary tests**

~~~ts
test("Store repository is control-plane only and owner-scoped", async () => {
  const source = await readFile("src/lib/merchant-stores/drizzle-repository.ts", "utf8");
  assert.match(source, /getControlPlaneDb/);
  assert.match(source, /organizationMemberships/);
  assert.match(source, /merchantAccountId/);
  assert.match(source, /role/);
  assert.match(source, /"owner"/);
  assert.match(source, /stores\.organizationId/);
  assert.doesNotMatch(
    source,
    /getDbForTenant|getTenant\(|TENANT_SCHEMA_HEADER|search_path|schemaName.*input/
  );
});

test("same-slug races use transaction plus DB unique constraint", async () => {
  const source = await readFile("src/lib/merchant-stores/drizzle-repository.ts", "utf8");
  assert.match(source, /\.transaction\(/);
  assert.match(source, /deleteFinalizesAt/);
  assert.match(source, /slugReleasedAt/);
  assert.match(source, /stores_slug_reserved_unique/);
  assert.match(source, /23505/);
  assert.match(source, /SLUG_UNAVAILABLE/);
});

test("edit delete and Undo compare expected updatedAt", async () => {
  const source = await readFile("src/lib/merchant-stores/drizzle-repository.ts", "utf8");
  assert.match(source, /expectedUpdatedAt/);
  assert.match(source, /stores\.updatedAt/);
  assert.match(source, /STORE_DELETE_UNDO_MS/);
  assert.match(source, /UNDO_EXPIRED/);
  assert.match(source, /TENANT_LINKED/);
});
~~~

- [ ] **Step 2: Run and verify RED**

~~~bash
npx --yes tsx --test tests/merchant-store.test.mts
~~~

Expected: FAIL.

- [ ] **Step 3: Add repository contract/error model**

Append:

~~~ts
export type StoreErrorCode =
  | "ORGANIZATION_REQUIRED"
  | "NOT_FOUND"
  | "SLUG_UNAVAILABLE"
  | "SLUG_LOCKED"
  | "CONFLICT"
  | "TENANT_LINKED"
  | "UNDO_EXPIRED";

export class MerchantStoreError extends Error {
  constructor(readonly code: StoreErrorCode, message: string) {
    super(message);
    this.name = "MerchantStoreError";
  }
}

export type DeleteStoreResult = {
  store: MerchantStore;
  undoVersion: string;
  undoExpiresAt: string;
};

export interface MerchantStoreRepository {
  listForMerchant(merchantId: number): Promise<MerchantStore[]>;
  findOwnedById(merchantId: number, storeId: number): Promise<MerchantStore | null>;
  createDraftForMerchant(
    merchantId: number,
    profile: StoreProfile,
    now?: Date
  ): Promise<MerchantStore>;
  updateOwned(
    merchantId: number,
    storeId: number,
    profile: StoreProfile,
    expectedUpdatedAt: Date,
    now?: Date
  ): Promise<MerchantStore>;
  isSlugAvailable(
    merchantId: number,
    slug: string,
    currentStoreId?: number,
    now?: Date
  ): Promise<boolean>;
  softDeleteOwned(
    merchantId: number,
    storeId: number,
    expectedUpdatedAt: Date,
    now?: Date
  ): Promise<DeleteStoreResult>;
  undoDeleteOwned(
    merchantId: number,
    storeId: number,
    expectedUpdatedAt: Date,
    now?: Date
  ): Promise<MerchantStore>;
}
~~~

- [ ] **Step 4: Implement reads and authorization**

Every normal Store query joins `stores.organizationId` to `organizationMemberships.organizationId` and requires:
`merchantAccountId = merchantId`, `role = "owner"`, `stores.deletedAt IS NULL`.
`findOwnedById` also requires exact Store id. Missing/deleted/cross-Organization returns null.

- [ ] **Step 5: Implement create and slug availability**

`createDraftForMerchant` transaction:
1. resolve merchant's first owner Organization ordered by membership creation + Organization id;
2. absent → `ORGANIZATION_REQUIRED`;
3. finalize only matching rows with deletedAt nonnull, slugReleasedAt null, deleteFinalizesAt <= now;
4. insert Store with `status: "draft"` and `tenantId: null`;
5. map PostgreSQL code `23505` with constraint `stores_slug_reserved_unique` to `SLUG_UNAVAILABLE`.

Use:

~~~ts
function isConstraintViolation(error: unknown, constraint: string) {
  const candidate = error as { code?: string; constraint?: string };
  return candidate.code === "23505" && candidate.constraint === constraint;
}
~~~

`isSlugAvailable` verifies owner Organization. If current Store id is supplied, verify it is owned before excluding it. Expired deleted reservation is logically available, but this read does not mutate; create/update performs finalization transactionally.

- [ ] **Step 6: Implement update/delete/Undo**

`updateOwned`:
- transaction, owned row `FOR UPDATE`;
- deleted/missing/cross-org → `NOT_FOUND`;
- stale expected `updatedAt` → `CONFLICT`;
- linked Tenant + changed slug → `SLUG_LOCKED`;
- target slug change finalizes only expired matching reservation;
- write display name and pre-provisioning slug, set updatedAt now;
- unique conflict → `SLUG_UNAVAILABLE`.

`softDeleteOwned`:
- lock owned active row;
- stale version → `CONFLICT`;
- tenant linked → `TENANT_LINKED`;
- set deletedAt now, deleteFinalizesAt now+10s, updatedAt now;
- return post-delete version + expiry.

`undoDeleteOwned`:
- lock owned deleted row;
- require slugReleasedAt null;
- require exact post-delete version;
- require deleteFinalizesAt > now else `UNDO_EXPIRED`;
- clear deletedAt/deleteFinalizesAt and set updatedAt now;
- never clear slugReleasedAt.

- [ ] **Step 7: Add server accessor**

~~~ts
import "server-only";
import { DrizzleMerchantStoreRepository } from "./drizzle-repository";

const repository = new DrizzleMerchantStoreRepository();

export function getMerchantStoreRepository() {
  return repository;
}
~~~

- [ ] **Step 8: Verify GREEN and commit**

~~~bash
npx --yes tsx --test tests/merchant-store.test.mts
git add src/lib/merchant-stores/core.ts \
  src/lib/merchant-stores/drizzle-repository.ts \
  src/lib/merchant-stores/server.ts tests/merchant-store.test.mts
git commit -m "feat: add merchant store repository"
~~~

Expected: PASS before commit.
