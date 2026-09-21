import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  STORE_DELETE_UNDO_MS,
  nextStoreVersion,
  parseStoreProfile,
  parseStoreVersion,
  suggestStoreSlug,
  validateStoreSlug,
} from "../src/lib/merchant-stores/core.ts";

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


test("Store repository is control-plane only and owner-scoped", async () => {
  const source = await readFile(
    "src/lib/merchant-stores/drizzle-repository.ts",
    "utf8"
  );
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
  const source = await readFile(
    "src/lib/merchant-stores/drizzle-repository.ts",
    "utf8"
  );
  assert.match(source, /\.transaction\(/);
  assert.match(source, /deleteFinalizesAt/);
  assert.match(source, /slugReleasedAt/);
  assert.match(source, /stores_slug_reserved_unique/);
  assert.match(source, /23505/);
  assert.match(source, /SLUG_UNAVAILABLE/);
});

test("edit delete and Undo compare expected updatedAt", async () => {
  const source = await readFile(
    "src/lib/merchant-stores/drizzle-repository.ts",
    "utf8"
  );
  assert.match(source, /expectedUpdatedAt/);
  assert.match(source, /stores\.updatedAt/);
  assert.match(source, /STORE_DELETE_UNDO_MS/);
  assert.match(source, /UNDO_EXPIRED/);
  assert.match(source, /TENANT_LINKED/);
});
