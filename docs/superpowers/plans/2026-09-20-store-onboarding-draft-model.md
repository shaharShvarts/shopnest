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
- A Store slug that still exists in `public.tenants.slug` must remain unavailable even if that Tenant was removed from the static registry; PR #37 must not create two platform identities for the same future URL.
- Every successful mutation must advance `updated_at` even when two writes receive the same millisecond clock value, so stale Undo/edit tokens cannot accidentally remain valid.

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
- `tests/admin-auth.test.mts`
- `tests/payment.test.mts`
- `tests/marketing-site.test.mts`
- `src/app/(marketing)/_components/DemoStoresSection.tsx`
- `src/app/(marketing)/examples/page.tsx`
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
- Modify: `tests/admin-auth.test.mts`
- Modify: `tests/payment.test.mts`
- Modify: `tests/marketing-site.test.mts`
- Modify: `src/app/(marketing)/_components/DemoStoresSection.tsx`
- Modify: `src/app/(marketing)/examples/page.tsx`

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
  assert.match(sql, /public\.stores/);
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

Create `src/drizzle/control-schema/store.ts`:

~~~ts
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  serial,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { organizations } from "./organization";
import { storeStatusEnum } from "./shared";
import { controlPlaneTenants } from "./tenant";

export const stores = pgTable(
  "stores",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 63 }).notNull(),
    status: storeStatusEnum("status").notNull().default("draft"),
    tenantId: integer("tenant_id").references(() => controlPlaneTenants.id),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deleteFinalizesAt: timestamp("delete_finalizes_at", { withTimezone: true }),
    slugReleasedAt: timestamp("slug_released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
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
  ]
);
~~~

The Organization and Tenant foreign keys intentionally use PostgreSQL default NO ACTION behavior; do not add `onDelete: "cascade"`.

Append to `src/drizzle/control-plane-schema.ts`:

~~~ts
export * from "@/drizzle/control-schema/store";
~~~

- [ ] **Step 4: Add migration 0008 and guarded cleanup**

Create `src/drizzle/control-migrations/0008_store_onboarding.sql`:

~~~sql
CREATE TYPE "public"."store_status" AS ENUM(
  'draft',
  'ready_for_provisioning',
  'provisioned'
);--> statement-breakpoint

CREATE TABLE "stores" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" integer NOT NULL,
  "display_name" varchar(160) NOT NULL,
  "slug" varchar(63) NOT NULL,
  "status" "public"."store_status" DEFAULT 'draft' NOT NULL,
  "tenant_id" integer,
  "deleted_at" timestamp with time zone,
  "delete_finalizes_at" timestamp with time zone,
  "slug_released_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "stores_status_tenant_consistency"
    CHECK (
      ("status" = 'provisioned' AND "tenant_id" IS NOT NULL)
      OR
      ("status" IN ('draft', 'ready_for_provisioning') AND "tenant_id" IS NULL)
    ),
  CONSTRAINT "stores_delete_window_consistency"
    CHECK (
      ("deleted_at" IS NULL AND "delete_finalizes_at" IS NULL)
      OR
      ("deleted_at" IS NOT NULL AND "delete_finalizes_at" IS NOT NULL)
    ),
  CONSTRAINT "stores_slug_release_requires_delete"
    CHECK ("slug_released_at" IS NULL OR "deleted_at" IS NOT NULL),
  CONSTRAINT "stores_delete_finalizes_after_delete"
    CHECK (
      "delete_finalizes_at" IS NULL
      OR "delete_finalizes_at" >= "deleted_at"
    )
);--> statement-breakpoint

ALTER TABLE "stores"
  ADD CONSTRAINT "stores_organization_id_organizations_id_fk"
  FOREIGN KEY ("organization_id")
  REFERENCES "public"."organizations"("id")
  ON UPDATE no action ON DELETE no action;--> statement-breakpoint

ALTER TABLE "stores"
  ADD CONSTRAINT "stores_tenant_id_tenants_id_fk"
  FOREIGN KEY ("tenant_id")
  REFERENCES "public"."tenants"("id")
  ON UPDATE no action ON DELETE no action;--> statement-breakpoint

CREATE UNIQUE INDEX "stores_slug_reserved_unique"
  ON "stores" USING btree ("slug")
  WHERE "slug_released_at" IS NULL;--> statement-breakpoint

CREATE UNIQUE INDEX "stores_tenant_id_unique"
  ON "stores" USING btree ("tenant_id")
  WHERE "tenant_id" IS NOT NULL;--> statement-breakpoint

CREATE INDEX "stores_organization_id_idx"
  ON "stores" USING btree ("organization_id");--> statement-breakpoint

DO $
DECLARE
  legacy_slug text;
  legacy_schema text;
  legacy_tenant_id integer;
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
    SELECT id
    INTO legacy_tenant_id
    FROM public.tenants
    WHERE slug = legacy_slug
      AND schema_name = legacy_schema;

    IF legacy_tenant_id IS NOT NULL THEN
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
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.stores WHERE tenant_id = legacy_tenant_id
      ) THEN
        DELETE FROM public.tenants
        WHERE id = legacy_tenant_id;
      ELSE
        RAISE NOTICE
          'Leaving legacy tenant % because schema or dependent control-plane data still exists',
          legacy_slug;
      END IF;
    END IF;

    legacy_tenant_id := NULL;
  END LOOP;
END $;
~~~

Register this entry after 0007 in `src/drizzle/control-migrations/meta/_journal.json`:

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
  nextStoreVersion,
  parseStoreProfile,
  parseStoreVersion,
  suggestStoreSlug,
  validateStoreSlug,
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

test("slug validation distinguishes reserved from malformed input", () => {
  assert.deepEqual(validateStoreSlug(" PANDA-POP "), {
    ok: true,
    slug: "panda-pop",
  });
  assert.deepEqual(validateStoreSlug(" ADMIN "), {
    ok: false,
    reason: "reserved",
  });
  assert.deepEqual(validateStoreSlug("panda pop"), {
    ok: false,
    reason: "invalid",
  });
});

test("Store versions always advance even inside the same millisecond", () => {
  const current = new Date("2026-09-20T10:00:00.100Z");
  assert.equal(
    nextStoreVersion(current, new Date("2026-09-20T10:00:00.100Z")).toISOString(),
    "2026-09-20T10:00:00.101Z"
  );
  assert.equal(
    nextStoreVersion(current, new Date("2026-09-20T10:00:01.000Z")).toISOString(),
    "2026-09-20T10:00:01.000Z"
  );
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

Add to `tests/marketing-site.test.mts`:

~~~ts
test("marketing does not link to removed legacy storefront routes", async () => {
  const source = (
    await Promise.all([
      read("src/app/(marketing)/_components/DemoStoresSection.tsx"),
      read("src/app/(marketing)/examples/page.tsx"),
    ])
  ).join("\n");

  assert.doesNotMatch(
    source,
    /href=["']\/(?:panda-pop|gift-shop|dvorik-collection)["']/
  );
});
~~~

The current admin/payment route fixtures also become RED when the static registry is emptied; Step 5 replaces those runtime-registry dependencies with explicit test-only validated Tenant fixtures.

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

Create `src/lib/merchant-stores/core.ts`:

~~~ts
import { z } from "zod";
import { STORE_RESERVED_ROUTE_SEGMENTS } from "@/lib/tenant-routing/core";
import { normalizeTenantSlug } from "@/lib/tenant-validation.mjs";

export const STORE_DELETE_UNDO_MS = 10_000;

export type StoreSlugValidation =
  | { ok: true; slug: string }
  | { ok: false; reason: "invalid" | "reserved" };

export function validateStoreSlug(value: unknown): StoreSlugValidation {
  if (typeof value !== "string") {
    return { ok: false, reason: "invalid" };
  }

  const slug = value.trim().toLowerCase();
  const normalized = normalizeTenantSlug(slug);
  if (!normalized || normalized.slug !== slug) {
    return { ok: false, reason: "invalid" };
  }
  if (STORE_RESERVED_ROUTE_SEGMENTS.has(slug)) {
    return { ok: false, reason: "reserved" };
  }
  return { ok: true, slug };
}

const storeSlugSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .superRefine((slug, context) => {
    const validation = validateStoreSlug(slug);
    if (!validation.ok) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          validation.reason === "reserved"
            ? "reserved_store_slug"
            : "invalid_store_slug",
      });
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

export function nextStoreVersion(current: Date, now = new Date()) {
  return new Date(Math.max(now.getTime(), current.getTime() + 1));
}
~~~

- [ ] **Step 5: Remove old static slugs and adapt every test/UI reference that depended on them**

In `src/lib/tenant-validation.mjs`:

~~~js
export const CONFIGURED_TENANT_SLUGS = Object.freeze([]);
~~~

Keep `normalizeTenantSlug` and the fail-closed configured-tenant map unchanged.

In `tests/route-navigation.test.mjs`, define a test-only resolver:

~~~js
import {
  normalizeTenantSlug,
  resolveConfiguredTenant,
} from "../src/lib/tenant-validation.mjs";

const fixtureTenantSlugs = new Set([
  "fixture-store",
  "gift-shop",
  "panda-pop",
  "dvorik-collection",
]);

function resolveFixtureTenant(value) {
  const tenant = normalizeTenantSlug(value);
  return tenant && fixtureTenantSlugs.has(tenant.slug) ? tenant : null;
}
~~~

Use `resolveFixtureTenant` only for positive pure-routing fixtures:
- `resolveTenantRoute(path, resolveFixtureTenant)`
- `prefixTenantPath(path, basePath, resolveFixtureTenant)`.

For the `TenantLink` VM mock, inject:

~~~js
"@/context/TenantContext": {
  useTenant: () => ({
    path: path =>
      routing.prefixTenantPath(
        path,
        "/fixture-store",
        resolveFixtureTenant
      ),
  }),
},
~~~

and update expected links to `/fixture-store/... `.

For the `TenantProvider` VM mock, inject the fixture resolver rather than the production empty registry:

~~~js
"@/lib/tenant": {
  ...routing,
  resolveConfiguredTenant: resolveFixtureTenant,
  prefixTenantPath: (path, basePath) =>
    routing.prefixTenantPath(path, basePath, resolveFixtureTenant),
},
~~~

Use `normalizeTenantSlug("fixture-store")` as the mocked tenant for the positive layout case. Add separate assertions that the real `resolveConfiguredTenant` returns null for all three removed slugs and that actual/default middleware returns 404 for them.

In `tests/admin-auth.test.mts`, remove the import of `resolveConfiguredTenant` and make route-tenant fixtures explicit pure values:

~~~ts
const pandaRouteTenant = {
  slug: "panda-pop",
  schema: "panda_pop",
  basePath: "/panda-pop",
};

const giftRouteTenant = {
  slug: "gift-shop",
  schema: "gift_shop",
  basePath: "/gift-shop",
};
~~~

These tests exercise admin authorization/navigation logic, not the production registry.

In `tests/payment.test.mts`, replace direct `resolveConfiguredTenant(slug)!` fixture creation with `normalizeTenantSlug(slug)!`, and define:

~~~ts
const paymentFixtureSlugs = new Set([
  "gift-shop",
  "panda-pop",
  "dvorik-collection",
]);

function resolvePaymentFixtureTenant(value: unknown) {
  const tenant = normalizeTenantSlug(value);
  return tenant && paymentFixtureSlugs.has(tenant.slug) ? tenant : null;
}
~~~

Use:

~~~ts
assert.equal(
  resolveTenantRoute(
    "/gift-shop/admin/payments",
    resolvePaymentFixtureTenant
  ).kind,
  "tenant"
);
~~~

For middleware tests that intentionally verify trusted-header overwrite with a positive tenant route, pass a test-only routing module:

~~~ts
const fixtureRouting = {
  ...tenantRouting,
  resolveTenantRoute: (pathname: string) =>
    tenantRouting.resolveTenantRoute(
      pathname,
      resolvePaymentFixtureTenant
    ),
};

const { middleware } = await loadWithMocks(
  "../src/middleware.ts",
  {
    nanoid: { nanoid: () => "synthetic-session" },
    "next/server": { NextResponse: /* existing test response mock */ },
    "./lib/tenant-routing/core": fixtureRouting,
  }
);
~~~

Keep a separate default-runtime test in `route-navigation.test.mjs` that proves the removed legacy slugs now 404. This keeps payment isolation tests independent from production registry contents.

Because the marketing homepage and `/examples` currently link directly to the removed Store routes, remove those dead links in the same cleanup. In `DemoStoresSection.tsx`, change the data to translation keys only and render static cards:

~~~tsx
const stores = [
  "examples.pandaPop",
  "examples.giftShop",
  "examples.dvorikCollection",
] as const;

<div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-3">
  {stores.map((name) => (
    <article key={name} className="rounded-2xl border p-6">
      <h3 className="text-xl font-semibold">{t(name)}</h3>
    </article>
  ))}
</div>
~~~

Apply the same non-clickable card pattern to `src/app/(marketing)/examples/page.tsx`; retain its Back home link.

Update the existing Marketing copy in both locale files:
- English `Marketing.examples.subtitle`: `New sample storefronts are coming soon.`
- Hebrew `Marketing.examples.subtitle`: `חנויות הדוגמה החדשות יעלו בקרוב.`

Do not delete the sample names; only stop advertising the removed routes as live storefronts.

Update `tests/control-plane.test.mts` so old Tenant rows are untrusted, and test `summarizePlatform` with explicit `StoreSummary` fixtures instead of pretending a runtime Tenant is configured.

- [ ] **Step 6: Verify GREEN and commit**

~~~bash
npx --yes tsx --test tests/merchant-store.test.mts tests/tenant.test.mts \
  tests/route-navigation.test.mjs tests/control-plane.test.mts \
  tests/admin-auth.test.mts tests/payment.test.mts tests/marketing-site.test.mts
node --test tests/tenant-provisioning.test.mjs
git add src/lib/merchant-stores/core.ts src/lib/tenant-routing/core.ts \
  src/lib/tenant-validation.mjs tests/merchant-store.test.mts \
  tests/tenant-provisioning.test.mjs tests/tenant.test.mts \
  tests/route-navigation.test.mjs tests/control-plane.test.mts \
  tests/admin-auth.test.mts tests/payment.test.mts tests/marketing-site.test.mts \
  src/app/'(marketing)'/_components/DemoStoresSection.tsx \
  src/app/'(marketing)'/examples/page.tsx src/messages/en.json src/messages/he.json
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
  assert.match(source, /controlPlaneTenants/);
  assert.match(source, /controlPlaneTenants\.slug/);
  assert.match(source, /nextStoreVersion/);
  assert.doesNotMatch(
    source,
    /getDbForTenant|getTenant\(|TENANT_SCHEMA_HEADER|search_path|schemaName.*input/
  );
});

test("same-slug races and existing Tenant slugs remain unavailable", async () => {
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

- [ ] **Step 4: Implement owner Organization resolution and active Store reads**

Use one server-derived Organization selector in `drizzle-repository.ts` and reuse it for every Store operation:

~~~ts
async function resolveOwnerOrganizationId(
  tx: ReturnType<typeof getControlPlaneDb>,
  merchantId: number
) {
  const [membership] = await tx
    .select({ organizationId: organizationMemberships.organizationId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.merchantAccountId, merchantId),
        eq(organizationMemberships.role, "owner")
      )
    )
    .orderBy(
      asc(organizationMemberships.createdAt),
      asc(organizationMemberships.organizationId)
    )
    .limit(1);

  return membership?.organizationId ?? null;
}
~~~

If the concrete Drizzle transaction type cannot use the helper signature above cleanly, keep the helper inside the transaction callback rather than weakening it to `any`.

Normal Store reads first resolve this Organization id, then scope by both Store id/Organization and `deleted_at IS NULL`:

~~~ts
const organizationId = await resolveOwnerOrganizationId(db, merchantId);
if (organizationId === null) return [];

return db
  .select(storeSelection)
  .from(stores)
  .where(
    and(
      eq(stores.organizationId, organizationId),
      isNull(stores.deletedAt)
    )
  )
  .orderBy(asc(stores.createdAt), asc(stores.id));
~~~

`findOwnedById` uses the same Organization id and adds `eq(stores.id, storeId)`; it returns `null` for missing, deleted, or cross-Organization rows.

- [ ] **Step 5: Implement slug collision/finalization helpers and draft creation**

Import `controlPlaneTenants`. Before reserving a Store slug, reject any existing Tenant with that slug, even though the static registry is empty:

~~~ts
async function assertNoTenantSlugCollision(
  tx: ReturnType<typeof getControlPlaneDb>,
  slug: string
) {
  const [tenant] = await tx
    .select({ id: controlPlaneTenants.id })
    .from(controlPlaneTenants)
    .where(eq(controlPlaneTenants.slug, slug))
    .limit(1);

  if (tenant) {
    throw new MerchantStoreError(
      "SLUG_UNAVAILABLE",
      "Store slug already belongs to a Tenant"
    );
  }
}
~~~

As with the Organization helper, if transaction typing differs, define this helper inside the transaction callback with the concrete inferred `tx`.

Finalize only expired reservations for the requested slug:

~~~ts
await tx
  .update(stores)
  .set({
    slugReleasedAt: now,
    updatedAt: now,
  })
  .where(
    and(
      eq(stores.slug, profile.slug),
      isNotNull(stores.deletedAt),
      isNull(stores.slugReleasedAt),
      lte(stores.deleteFinalizesAt, now)
    )
  );
~~~

Then create:

~~~ts
const [created] = await tx
  .insert(stores)
  .values({
    organizationId,
    displayName: profile.displayName,
    slug: profile.slug,
    status: "draft",
    tenantId: null,
  })
  .returning(storeSelection);
~~~

Wrap the transaction in `try/catch`. Map only PostgreSQL `23505` with constraint `stores_slug_reserved_unique` to `SLUG_UNAVAILABLE`; rethrow everything else:

~~~ts
function isConstraintViolation(error: unknown, constraint: string) {
  const candidate = error as { code?: string; constraint?: string };
  return candidate.code === "23505" && candidate.constraint === constraint;
}
~~~

`isSlugAvailable` must:
1. resolve the same owner Organization;
2. validate/exclude `currentStoreId` only if it belongs to that Organization;
3. return false if `public.tenants.slug = slug`;
4. return false for an active Store reservation or deleted reservation whose `deleteFinalizesAt > now`;
5. return true when the only Store reservation is deleted, unreleased, and expired; do not mutate during this advisory read.

- [ ] **Step 6: Implement edit/delete/Undo with monotonic versions**

For `updateOwned`, transactionally lock the Store row scoped to the resolved Organization:

~~~ts
const [current] = await tx
  .select(storeSelection)
  .from(stores)
  .where(
    and(
      eq(stores.id, storeId),
      eq(stores.organizationId, organizationId),
      isNull(stores.deletedAt)
    )
  )
  .limit(1)
  .for("update");

if (!current) {
  throw new MerchantStoreError("NOT_FOUND", "Store not found");
}
if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) {
  throw new MerchantStoreError("CONFLICT", "Store changed");
}
if (current.tenantId !== null && profile.slug !== current.slug) {
  throw new MerchantStoreError("SLUG_LOCKED", "Store slug is locked");
}
~~~

If slug changes, run `assertNoTenantSlugCollision(tx, profile.slug)`, then opportunistically finalize only the expired matching Store reservation. Persist a strictly newer version:

~~~ts
const updatedAt = nextStoreVersion(current.updatedAt, now);

const [updated] = await tx
  .update(stores)
  .set({
    displayName: profile.displayName,
    slug: current.tenantId === null ? profile.slug : current.slug,
    updatedAt,
  })
  .where(eq(stores.id, current.id))
  .returning(storeSelection);
~~~

Map `stores_slug_reserved_unique` exactly as creation does.

For `softDeleteOwned`, lock the active owned row, require exact expected version, reject linked Tenant, then:

~~~ts
const updatedAt = nextStoreVersion(current.updatedAt, now);
const deleteFinalizesAt = new Date(
  now.getTime() + STORE_DELETE_UNDO_MS
);

const [deleted] = await tx
  .update(stores)
  .set({
    deletedAt: now,
    deleteFinalizesAt,
    updatedAt,
  })
  .where(eq(stores.id, current.id))
  .returning(storeSelection);

return {
  store: mapStore(deleted),
  undoVersion: deleted.updatedAt.toISOString(),
  undoExpiresAt: deleteFinalizesAt.toISOString(),
};
~~~

For `undoDeleteOwned`, resolve the same Organization and lock by Store id/Organization without the normal `deletedAt IS NULL` filter. Require:
- `deletedAt !== null`;
- `slugReleasedAt === null`;
- exact post-delete `updatedAt`;
- nonnull `deleteFinalizesAt` and `deleteFinalizesAt.getTime() > now.getTime()`.

Otherwise throw `NOT_FOUND`, `CONFLICT`, or `UNDO_EXPIRED` as appropriate. Restore with:

~~~ts
const updatedAt = nextStoreVersion(current.updatedAt, now);

const [restored] = await tx
  .update(stores)
  .set({
    deletedAt: null,
    deleteFinalizesAt: null,
    updatedAt,
  })
  .where(eq(stores.id, current.id))
  .returning(storeSelection);
~~~

Never clear `slugReleasedAt`.

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


---

### Task 4: Authenticated Store server actions

**Files:**
- Create: `src/app/(merchant)/dashboard/stores/_actions.ts`
- Create: `tests/merchant-store-routes.test.mts`

**Interfaces:**
- Consumes: `requireMerchantPage()`, Task 2 parsers/schema, Task 3 repository.
- Produces: `createStoreAction`, `updateStoreAction`,
  `checkStoreSlugAvailabilityAction`, `deleteStoreAction`,
  `undoStoreDeleteAction`.

- [ ] **Step 1: Write failing action-boundary tests**

Create `tests/merchant-store-routes.test.mts`:

~~~ts
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Store actions derive merchant authority server-side", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/_actions.ts",
    "utf8"
  );

  assert.match(source, /requireMerchantPage\(\)/);
  assert.match(source, /getMerchantStoreRepository/);
  assert.match(source, /storeProfileSchema/);
  assert.match(source, /parseStoreId/);
  assert.match(source, /parseStoreVersion/);
  assert.doesNotMatch(
    source,
    /merchantAccountId:\s*parsed|organizationId:\s*parsed|tenantId:\s*parsed|schemaName:\s*parsed|status:\s*parsed|role:\s*parsed/
  );
  assert.doesNotMatch(
    source,
    /getDbForTenant|getTenant\(|TENANT_SCHEMA_HEADER|search_path/
  );
});

test("delete returns a server-issued post-delete version for Undo", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/_actions.ts",
    "utf8"
  );

  assert.match(source, /softDeleteOwned/);
  assert.match(source, /undoVersion/);
  assert.match(source, /undoExpiresAt/);
  assert.match(source, /undoDeleteOwned/);
});

test("slug availability is authenticated and advisory", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/_actions.ts",
    "utf8"
  );
  const start = source.indexOf("checkStoreSlugAvailabilityAction");
  assert.ok(start >= 0);
  const availability = source.slice(start);
  assert.match(availability, /requireMerchantPage\(\)/);
  assert.match(availability, /isSlugAvailable/);
});
~~~

- [ ] **Step 2: Run and verify RED**

~~~bash
npx --yes tsx --test tests/merchant-store-routes.test.mts
~~~

Expected: FAIL because Store actions do not exist.

- [ ] **Step 3: Define closed action state and error mapping**

In `_actions.ts`:

~~~ts
"use server";

import { redirect } from "next/navigation";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import {
  MerchantStoreError,
  parseStoreId,
  parseStoreVersion,
  storeProfileSchema,
  validateStoreSlug,
} from "@/lib/merchant-stores/core";
import { getMerchantStoreRepository } from "@/lib/merchant-stores/server";

export type StoreActionMessage =
  | "invalidStoreDetails"
  | "storeUnavailable"
  | "slugUnavailable"
  | "slugLocked"
  | "storeChanged"
  | "storeAlreadyProvisioned"
  | "undoExpired";

export type StoreFormActionState = {
  success: false;
  message?: StoreActionMessage;
  errors?: Record<string, string[] | undefined>;
};

function messageForStoreError(error: unknown): StoreActionMessage {
  if (!(error instanceof MerchantStoreError)) return "storeUnavailable";

  switch (error.code) {
    case "SLUG_UNAVAILABLE":
      return "slugUnavailable";
    case "SLUG_LOCKED":
      return "slugLocked";
    case "CONFLICT":
      return "storeChanged";
    case "TENANT_LINKED":
      return "storeAlreadyProvisioned";
    case "UNDO_EXPIRED":
      return "undoExpired";
    default:
      return "storeUnavailable";
  }
}
~~~

Never send raw DB errors to client UI.

- [ ] **Step 4: Implement create action**

~~~ts
export async function createStoreAction(
  _state: StoreFormActionState,
  formData: FormData
): Promise<StoreFormActionState> {
  const merchant = await requireMerchantPage();
  const parsed = storeProfileSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: "invalidStoreDetails",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  let store;
  try {
    store = await getMerchantStoreRepository().createDraftForMerchant(
      merchant.id,
      parsed.data
    );
  } catch (error) {
    return { success: false, message: messageForStoreError(error) };
  }

  redirect("/dashboard/stores/" + store.id);
}
~~~

- [ ] **Step 5: Implement update action**

~~~ts
export async function updateStoreAction(
  _state: StoreFormActionState,
  formData: FormData
): Promise<StoreFormActionState> {
  const merchant = await requireMerchantPage();
  const parsed = storeProfileSchema.safeParse(Object.fromEntries(formData));

  if (!parsed.success) {
    return {
      success: false,
      message: "invalidStoreDetails",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  let storeId: number;
  let expectedUpdatedAt: Date;
  try {
    storeId = parseStoreId(formData.get("storeId"));
    expectedUpdatedAt = parseStoreVersion(formData.get("expectedUpdatedAt"));
  } catch {
    return { success: false, message: "storeChanged" };
  }

  try {
    await getMerchantStoreRepository().updateOwned(
      merchant.id,
      storeId,
      parsed.data,
      expectedUpdatedAt
    );
  } catch (error) {
    return { success: false, message: messageForStoreError(error) };
  }

  redirect("/dashboard/stores/" + storeId);
}
~~~

`storeId` is lookup input only. The repository reauthorizes ownership.

- [ ] **Step 6: Implement authenticated slug availability**

~~~ts
export async function checkStoreSlugAvailabilityAction(input: {
  slug: string;
  currentStoreId?: number;
}) {
  const merchant = await requireMerchantPage();
  const validation = validateStoreSlug(input.slug);
  if (!validation.ok) {
    return {
      available: false as const,
      reason: validation.reason,
    };
  }

  let currentStoreId: number | undefined;
  try {
    currentStoreId =
      input.currentStoreId === undefined
        ? undefined
        : parseStoreId(input.currentStoreId);
  } catch {
    return { available: false as const, reason: "invalid" as const };
  }

  const available = await getMerchantStoreRepository().isSlugAvailable(
    merchant.id,
    validation.slug,
    currentStoreId
  );

  return {
    available,
    reason: available ? null : ("taken" as const),
    slug: validation.slug,
  };
}
~~~

This endpoint is UI feedback only. Create/update still enforce DB uniqueness.

- [ ] **Step 7: Implement delete and Undo actions**

~~~ts
export async function deleteStoreAction(input: {
  storeId: number;
  expectedUpdatedAt: string;
}) {
  const merchant = await requireMerchantPage();

  try {
    const deleted = await getMerchantStoreRepository().softDeleteOwned(
      merchant.id,
      parseStoreId(input.storeId),
      parseStoreVersion(input.expectedUpdatedAt)
    );
    return {
      ok: true as const,
      storeId: deleted.store.id,
      undoVersion: deleted.undoVersion,
      undoExpiresAt: deleted.undoExpiresAt,
    };
  } catch (error) {
    return {
      ok: false as const,
      message: messageForStoreError(error),
    };
  }
}

export async function undoStoreDeleteAction(input: {
  storeId: number;
  expectedUpdatedAt: string;
}) {
  const merchant = await requireMerchantPage();

  try {
    const restored = await getMerchantStoreRepository().undoDeleteOwned(
      merchant.id,
      parseStoreId(input.storeId),
      parseStoreVersion(input.expectedUpdatedAt)
    );
    return {
      ok: true as const,
      storeId: restored.id,
      updatedAt: restored.updatedAt.toISOString(),
    };
  } catch (error) {
    return {
      ok: false as const,
      message: messageForStoreError(error),
    };
  }
}
~~~

- [ ] **Step 8: Verify GREEN and commit**

~~~bash
npx --yes tsx --test tests/merchant-store.test.mts tests/merchant-store-routes.test.mts
git add src/app/'(merchant)'/dashboard/stores/_actions.ts \
  tests/merchant-store-routes.test.mts
git commit -m "feat: add merchant store actions"
~~~

Expected: PASS before commit.

---

### Task 5: Store form, detail, and edit pages

**Files:**
- Create: `src/app/(merchant)/dashboard/stores/_components/StoreForm.tsx`
- Create: `src/app/(merchant)/dashboard/stores/new/page.tsx`
- Create: `src/app/(merchant)/dashboard/stores/[id]/page.tsx`
- Create: `src/app/(merchant)/dashboard/stores/[id]/edit/page.tsx`
- Modify: `src/messages/en.json`
- Modify: `src/messages/he.json`
- Modify: `tests/merchant-store-routes.test.mts`

**Interfaces:**
- Consumes Task 4 actions, Task 3 repository, and Task 2 `validateStoreSlug` / `suggestStoreSlug`.
- Produces create/edit/detail UX; no Tenant/schema side effects.

- [ ] **Step 1: Add failing page/form/translation tests**

Append:

~~~ts
test("merchant Store pages are global protected and tenant-independent", async () => {
  const paths = [
    "src/app/(merchant)/dashboard/stores/new/page.tsx",
    "src/app/(merchant)/dashboard/stores/[id]/page.tsx",
    "src/app/(merchant)/dashboard/stores/[id]/edit/page.tsx",
  ];
  const sources = await Promise.all(paths.map((path) => readFile(path, "utf8")));

  for (const source of sources) {
    assert.match(source, /requireMerchantPage\(\)/);
    assert.doesNotMatch(
      source,
      /getDbForTenant|getTenant\(|TenantLink|TENANT_SCHEMA_HEADER|search_path/
    );
  }
});

test("Store form exposes only merchant-editable fields and slug UX", async () => {
  const form = await readFile(
    "src/app/(merchant)/dashboard/stores/_components/StoreForm.tsx",
    "utf8"
  );

  assert.match(form, /name=["']displayName["']/);
  assert.match(form, /name=["']slug["']/);
  assert.match(form, /suggestStoreSlug/);
  assert.match(form, /checkStoreSlugAvailabilityAction/);
  assert.match(form, /shopnest\.co\.il/);
  assert.doesNotMatch(
    form,
    /name=["'](?:merchantAccountId|organizationId|tenantId|schemaName|role|status)["']/
  );
});

test("MerchantStore translations stay aligned", async () => {
  const [en, he] = await Promise.all([
    readFile("src/messages/en.json", "utf8").then(JSON.parse),
    readFile("src/messages/he.json", "utf8").then(JSON.parse),
  ]);
  assert.deepEqual(
    Object.keys(en.MerchantStore).sort(),
    Object.keys(he.MerchantStore).sort()
  );
});
~~~

- [ ] **Step 2: Run and verify RED**

~~~bash
npx --yes tsx --test tests/merchant-store-routes.test.mts
~~~

Expected: FAIL.

- [ ] **Step 3: Add aligned MerchantStore translation keys**

Add the same keys to both locale files:

~~~text
myStores
createFirstStore
addStore
createStoreTitle
createStoreHelp
editStoreTitle
editStoreHelp
storeName
slug
futureUrl
slugAvailable
slugUnavailable
slugInvalid
slugReserved
slugManualRequired
checkingSlug
createStore
creatingStore
saveStore
savingStore
invalidStoreDetails
storeUnavailable
slugLocked
storeChanged
storeAlreadyProvisioned
undoExpired
draft
ready_for_provisioning
provisioned
notLiveYet
tenant
notProvisioned
editStore
backToStores
deleteStore
storeDeleted
undo
undoing
deleteBlocked
noStoresYet
storesReady
manageStores
~~~

English `slugLocked`:
`Store address is locked after activation because it is connected to the tenant and the store data structure.`

Hebrew should convey the same approved meaning naturally.

- [ ] **Step 4: Implement StoreForm state model**

Use:

~~~ts
const [displayName, setDisplayName] = useState(
  initialValues?.displayName ?? ""
);
const [slug, setSlug] = useState(initialValues?.slug ?? "");
const [slugEdited, setSlugEdited] = useState(mode === "edit");
const [availability, setAvailability] = useState<
  "idle" | "checking" | "available" | "unavailable" | "invalid" | "reserved"
>("idle");

function handleDisplayNameChange(value: string) {
  setDisplayName(value);
  if (!slugEdited) setSlug(suggestStoreSlug(value));
}

function handleSlugChange(value: string) {
  setSlugEdited(true);
  setSlug(value.toLowerCase());
}
~~~

Use `validateStoreSlug` before making the advisory server request, then debounce only valid slugs:

~~~ts
useEffect(() => {
  const validation = validateStoreSlug(slug);
  if (!validation.ok) {
    setAvailability(validation.reason);
    return;
  }

  let cancelled = false;
  const timer = window.setTimeout(() => {
    setAvailability("checking");

    void checkStoreSlugAvailabilityAction({
      slug: validation.slug,
      currentStoreId: mode === "edit" ? initialValues?.id : undefined,
    }).then((result) => {
      if (cancelled) return;
      if (result.reason === "invalid" || result.reason === "reserved") {
        setAvailability(result.reason);
      } else {
        setAvailability(result.available ? "available" : "unavailable");
      }
    });
  }, 300);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
  };
}, [slug, mode, initialValues?.id]);
~~~

This is UX feedback only; submit validation and DB constraints remain authoritative.

Render:
- required `displayName`;
- required `slug`;
- URL preview using `shopnest.co.il/` + slug;
- `aria-live="polite"` status;
- manual slug hint when suggestion is empty;
- hidden `storeId` and `expectedUpdatedAt` only in edit mode;
- slug disabled/read-only if `tenantId !== null`;
- visible lock explanation when linked.

Use `useActionState` with create/update action.

- [ ] **Step 5: Implement create page**

Exact server flow:

~~~ts
const merchant = await requireMerchantPage();
const organization =
  await getMerchantOrganizationRepository().findFirstForMerchant(merchant.id);

if (!organization) {
  redirect("/dashboard/business/new");
}
~~~

Then render `StoreForm mode="create"`. Never access Tenant context.

- [ ] **Step 6: Implement detail page**

Exact ownership flow:

~~~ts
const merchant = await requireMerchantPage();
const id = parseStoreId((await params).id);
const store = await getMerchantStoreRepository().findOwnedById(
  merchant.id,
  id
);

if (!store) notFound();
~~~

Render:
- display name;
- future URL;
- status;
- Tenant id or Not provisioned;
- Not live yet for null Tenant;
- Edit link;
- Back to stores link.

- [ ] **Step 7: Implement edit page**

Use the same merchant/id/owned Store lookup. Pass:

~~~ts
initialValues={{
  id: store.id,
  displayName: store.displayName,
  slug: store.slug,
  tenantId: store.tenantId,
  updatedAt: store.updatedAt.toISOString(),
}}
~~~

to `StoreForm mode="edit"`.

- [ ] **Step 8: Verify tests/build and commit**

~~~bash
npx --yes tsx --test tests/merchant-store.test.mts tests/merchant-store-routes.test.mts
npm run build
git add src/app/'(merchant)'/dashboard/stores/_components/StoreForm.tsx \
  src/app/'(merchant)'/dashboard/stores/new/page.tsx \
  src/app/'(merchant)'/dashboard/stores/'[id]'/page.tsx \
  src/app/'(merchant)'/dashboard/stores/'[id]'/edit/page.tsx \
  src/messages/en.json src/messages/he.json tests/merchant-store-routes.test.mts
git commit -m "feat: add merchant store forms and details"
~~~

Expected: tests PASS and build exit 0 before commit.

---

### Task 6: Store list, first-store dashboard entry point, optimistic delete, and Undo

**Files:**
- Create: `src/app/(merchant)/dashboard/stores/_components/StoreList.tsx`
- Create: `src/app/(merchant)/dashboard/stores/page.tsx`
- Modify: `src/app/(merchant)/dashboard/page.tsx`
- Modify: `tests/merchant-store-routes.test.mts`

**Interfaces:**
- Consumes `listForMerchant`, `deleteStoreAction`, `undoStoreDeleteAction`.
- Produces approved My Stores UX and immediate reversible delete behavior.

- [ ] **Step 1: Add failing list/dashboard tests**

~~~ts
test("dashboard replaces store-setup placeholder with Store onboarding", async () => {
  const dashboard = await readFile(
    "src/app/(merchant)/dashboard/page.tsx",
    "utf8"
  );

  assert.match(dashboard, /getMerchantStoreRepository/);
  assert.match(dashboard, /listForMerchant/);
  assert.match(dashboard, /\/dashboard\/stores\/new/);
  assert.match(dashboard, /\/dashboard\/stores/);
  assert.doesNotMatch(dashboard, /storeSetupLater/);
});

test("Store list optimistically deletes and offers ten-second Undo", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/_components/StoreList.tsx",
    "utf8"
  );

  assert.match(source, /deleteStoreAction/);
  assert.match(source, /undoStoreDeleteAction/);
  assert.match(source, /setHiddenStoreIds/);
  assert.match(source, /autoClose:\s*10_000/);
  assert.match(source, /closeOnClick:\s*false/);
  assert.match(source, /undoVersion/);
  assert.match(source, /router\.refresh\(\)/);
  assert.match(source, /deleteBlocked/);
});
~~~

- [ ] **Step 2: Run and verify RED**

~~~bash
npx --yes tsx --test tests/merchant-store-routes.test.mts
~~~

Expected: FAIL.

- [ ] **Step 3: Implement Store list page**

Create `src/app/(merchant)/dashboard/stores/page.tsx` with this server flow:

~~~tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { getMerchantOrganizationRepository } from "@/lib/merchant-organizations/server";
import { getMerchantStoreRepository } from "@/lib/merchant-stores/server";
import { StoreList } from "./_components/StoreList";

export default async function MerchantStoresPage() {
  const merchant = await requireMerchantPage();
  const organization =
    await getMerchantOrganizationRepository().findFirstForMerchant(merchant.id);

  if (!organization) {
    redirect("/dashboard/business/new");
  }

  const stores = await getMerchantStoreRepository().listForMerchant(merchant.id);
  const t = await getTranslations("MerchantStore");

  const items = stores.map((store) => ({
    id: store.id,
    displayName: store.displayName,
    slug: store.slug,
    status: store.status,
    tenantId: store.tenantId,
    updatedAt: store.updatedAt.toISOString(),
  }));

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">{t("myStores")}</h1>
        <Link href="/dashboard/stores/new">{t("addStore")}</Link>
      </div>

      {items.length === 0 ? (
        <section className="mt-8 rounded-2xl bg-background p-8 ring-1 ring-black/5">
          <p>{t("noStoresYet")}</p>
          <Link href="/dashboard/stores/new">{t("createFirstStore")}</Link>
        </section>
      ) : (
        <StoreList stores={items} />
      )}
    </main>
  );
}
~~~

Keep styling aligned with the existing dashboard/business pages; the important contract is the server-side auth/Organization check and Date serialization above.

- [ ] **Step 4: Implement immediate delete and Undo**

Use this client item shape and state in `StoreList.tsx`:

~~~ts
type StoreListItem = {
  id: number;
  displayName: string;
  slug: string;
  status: "draft" | "ready_for_provisioning" | "provisioned";
  tenantId: number | null;
  updatedAt: string;
};

const [hiddenStoreIds, setHiddenStoreIds] = useState<Set<number>>(
  () => new Set()
);

function setHidden(storeId: number, hidden: boolean) {
  setHiddenStoreIds((current) => {
    const next = new Set(current);
    if (hidden) next.add(storeId);
    else next.delete(storeId);
    return next;
  });
}
~~~

Delete handler:

~~~ts
async function handleDelete(store: StoreListItem) {
  if (store.tenantId !== null) {
    toast.warning(t("deleteBlocked"));
    return;
  }

  setHidden(store.id, true);

  const result = await deleteStoreAction({
    storeId: store.id,
    expectedUpdatedAt: store.updatedAt,
  });

  if (!result.ok) {
    setHidden(store.id, false);
    toast.error(t(result.message));
    return;
  }

  showUndoToast(store.id, result.undoVersion);
}
~~~

Undo toast and handler:

~~~tsx
function showUndoToast(storeId: number, undoVersion: string) {
  let toastId: ReturnType<typeof toast.info>;

  toastId = toast.info(
    <span className="flex items-center gap-3">
      <span>{t("storeDeleted")}</span>
      <button
        type="button"
        className="font-semibold underline"
        onClick={() => void handleUndo(storeId, undoVersion, toastId)}
      >
        {t("undo")}
      </button>
    </span>,
    {
      autoClose: 10_000,
      closeOnClick: false,
    }
  );
}

async function handleUndo(
  storeId: number,
  undoVersion: string,
  toastId: ReturnType<typeof toast.info>
) {
  const result = await undoStoreDeleteAction({
    storeId,
    expectedUpdatedAt: undoVersion,
  });

  toast.dismiss(toastId);

  if (!result.ok) {
    toast.error(t(result.message));
    router.refresh();
    return;
  }

  setHidden(storeId, false);
  router.refresh();
}
~~~

Render only rows whose ids are not in `hiddenStoreIds`. For `tenantId !== null`, render a disabled/descriptive delete control plus `deleteBlocked`; do not call the delete action.

- [ ] **Step 5: Replace dashboard Store placeholder**

In `src/app/(merchant)/dashboard/page.tsx`, load Stores only after an Organization exists:

~~~ts
const stores = organization
  ? await getMerchantStoreRepository().listForMerchant(merchant.id)
  : [];
~~~

Replace the old `storeSetupLater` section with the approved state split:

~~~tsx
{organization ? (
  <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
    <h2 className="text-xl font-bold">{tStore("myStores")}</h2>

    {stores.length === 0 ? (
      <>
        <p className="mt-2 text-muted-foreground">{tStore("noStoresYet")}</p>
        <Link
          href="/dashboard/stores/new"
          className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-foreground px-4 py-2 font-semibold text-background"
        >
          {tStore("createFirstStore")}
        </Link>
      </>
    ) : (
      <>
        <p className="mt-2 text-muted-foreground">
          {tStore("storesReady", { count: stores.length })}
        </p>
        <ul className="mt-4 space-y-2">
          {stores.slice(0, 3).map((store) => (
            <li key={store.id}>
              {store.displayName} — {tStore(store.status)}
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/dashboard/stores">{tStore("manageStores")}</Link>
          <Link href="/dashboard/stores/new">{tStore("addStore")}</Link>
        </div>
      </>
    )}
  </section>
) : null}
~~~

Add `const tStore = await getTranslations("MerchantStore")` and remove the old `storeSetupLater` copy usage. Ensure the `storesReady` translation accepts `{count}`.

- [ ] **Step 6: Verify tests/build and commit**

~~~bash
npx --yes tsx --test tests/merchant-organization-routes.test.mts \
  tests/merchant-store-routes.test.mts
npm run build
git add src/app/'(merchant)'/dashboard/stores/_components/StoreList.tsx \
  src/app/'(merchant)'/dashboard/stores/page.tsx \
  src/app/'(merchant)'/dashboard/page.tsx \
  tests/merchant-store-routes.test.mts
git commit -m "feat: add store onboarding dashboard"
~~~

Expected: tests PASS and build exit 0 before commit.

---

### Task 7: Route audit, CI, full regression, DEV/STAGING acceptance

**Files:**
- Modify: `docs/route-audit.md`
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `tests/route-navigation.test.mjs`
- Modify: `tests/merchant-store-routes.test.mts`

**Interfaces:**
- Produces documented route behavior, mandatory CI coverage, and READY TO MERGE evidence. Does not merge.

- [ ] **Step 1: Add failing route-audit test**

~~~ts
test("route audit documents merchant Store routes and legacy slug 404", async () => {
  const audit = await readFile("docs/route-audit.md", "utf8");
  const tick = String.fromCharCode(96);

  for (const route of [
    "/dashboard/stores",
    "/dashboard/stores/new",
    "/dashboard/stores/[id]",
    "/dashboard/stores/[id]/edit",
  ]) {
    assert.ok(
      audit.includes(tick + route + tick),
      "Missing route " + route
    );
  }

  assert.match(audit, /panda-pop.*404|404.*panda-pop/i);
});
~~~

Add the four Store routes to the platform route inventory in `tests/route-navigation.test.mjs` using the exact route strings its discovery helper produces.

- [ ] **Step 2: Run and verify RED**

~~~bash
npx --yes tsx --test tests/route-navigation.test.mjs \
  tests/merchant-store-routes.test.mts
~~~

Expected: FAIL until route audit/inventory are updated.

- [ ] **Step 3: Update route audit**

Add:
- `/dashboard/stores` — active merchant + owner Organization; no Organization redirects to business creation.
- `/dashboard/stores/new` — creates draft Store only; no Tenant/schema.
- `/dashboard/stores/[id]` — owned active Store; invalid/cross-org/deleted is 404.
- `/dashboard/stores/[id]/edit` — owner edit; slug locked after Tenant linkage.

State explicitly that former demo slugs return 404 after registry cleanup until future provisioning/dynamic trusted registry. Store creation does not activate routing.

- [ ] **Step 4: Wire Store tests into package and CI**

Add to `package.json`:

~~~json
"merchant-store:test": "node --experimental-strip-types --test tests/merchant-store.test.mts tests/merchant-store-routes.test.mts"
~~~

Add to CI after merchant Organization tests:

~~~yaml
npx --yes tsx --test tests/merchant-store.test.mts tests/merchant-store-routes.test.mts
~~~

- [ ] **Step 5: Run complete automated suite**

~~~bash
npm ci
npm run tenant:test
npm run routing:test
npm run cart:test
npm run checkout:test
npm run inventory:test
npm run admin-auth:test
npm run control-plane:test
npm run catalog:test
npm run storefront-ui:test
npm run admin-ui:test
npm run search:test
npm run storefront-catalog:test
npm run customer-auth:test
npm run google-auth:test
npm run shipping:test
npm run cli-env:test
npm run database:test
npm run payment:test
npm run image:test
npm run environment-auth:test
npm run marketing:test
npx --yes tsx --test tests/merchant-auth.test.mts tests/merchant-auth-routes.test.mts
npx --yes tsx --test tests/merchant-organization.test.mts tests/merchant-organization-routes.test.mts
npx --yes tsx --test tests/merchant-store.test.mts tests/merchant-store-routes.test.mts
~~~

On current Ubuntu DEV host, if a script fails only with `ERR_NO_TYPESCRIPT` because `process.features.typescript=false`, rerun that same test file via `npx --yes tsx --test ...`. Do not classify the distro-Node limitation as application failure.

Expected: zero test failures.

- [ ] **Step 6: Run production build**

~~~bash
npm run build
~~~

Expected: exit 0.

- [ ] **Step 7: DEV acceptance**

Deploy branch through existing `/srv/shopnest/dev` procedure and run the existing control-plane migration command for DEV.

Manual flow:
1. merchant signup/login;
2. create Business;
3. dashboard shows Create your first store;
4. create Panda Pop;
5. slug suggestion `panda-pop`;
6. URL preview `shopnest.co.il/panda-pop`;
7. Store status `draft` and not live;
8. edit name/slug;
9. delete → immediate disappearance + Undo;
10. Undo inside 10 seconds restores;
11. delete again and wait >10 seconds;
12. create a new Store with same `panda-pop` slug;
13. direct `/panda-pop` still returns 404.

DB verification:

~~~sql
SELECT
  id, organization_id, display_name, slug, status, tenant_id,
  deleted_at, delete_finalizes_at, slug_released_at, created_at, updated_at
FROM public.stores
ORDER BY id;

SELECT count(*) AS tenants FROM public.tenants;

SELECT schema_name
FROM information_schema.schemata
WHERE schema_name IN ('panda_pop', 'gift_shop', 'dvorik_collection');
~~~

Expected:
- active recreated Store belongs to expected Organization;
- active Store is draft with null tenant_id;
- historical finalized deleted Store remains with nonnull slug_released_at;
- no Tenant row/schema created by Store onboarding.

- [ ] **Step 8: STAGING acceptance**

Deploy via existing `/srv/shopnest/staging` procedure, apply control-plane migration, repeat create/view/edit/delete/Undo/delete-expire-slug-reuse flow.

Verify:
- no Tenant/schema creation;
- old Storefront slugs remain 404;
- global merchant routes remain healthy.

- [ ] **Step 9: Commit docs/CI changes**

~~~bash
git add docs/route-audit.md package.json .github/workflows/ci.yml \
  tests/route-navigation.test.mjs tests/merchant-store-routes.test.mts
git commit -m "test: verify store onboarding end to end"
~~~

- [ ] **Step 10: Push and require green GitHub Actions**

Push `feature/store-onboarding-draft-model`. GitHub Actions must conclude `success` for all tests and `npm run build`.

- [ ] **Step 11: Final diff review**

~~~bash
git diff --stat master...HEAD
git diff master...HEAD
~~~

Verify:
- no Tenant/schema provisioning;
- no browser-derived tenant/schema authority;
- no production environment mutation;
- no Store hard delete;
- no Product delete refactor;
- no legacy static tenant slugs;
- no historical migration rewrite;
- no secrets/unrelated refactor.

- [ ] **Step 12: Stop at READY TO MERGE**

Report branch/PR, migration evidence, focused Store tests, full CI result, build result, DEV acceptance, STAGING acceptance, and known limitations. Do not merge until explicit user approval.
