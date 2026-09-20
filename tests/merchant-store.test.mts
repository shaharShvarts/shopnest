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
