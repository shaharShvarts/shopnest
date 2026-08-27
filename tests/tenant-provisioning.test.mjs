import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizeTenantSlug,
  resolveConfiguredTenant,
} from "../src/lib/tenant-validation.mjs";
import {
  assertSafeTenantSchema,
  readDrizzleMigrations,
  scopeMigrationSql,
} from "../scripts/lib/tenant-provisioning.mjs";

test("configured tenant slugs map to safe PostgreSQL schemas", () => {
  assert.equal(resolveConfiguredTenant("panda-pop")?.schema, "panda_pop");
  assert.equal(
    resolveConfiguredTenant("dvorik-collection")?.schema,
    "dvorik_collection"
  );
  assert.equal(resolveConfiguredTenant("gift-shop")?.schema, "gift_shop");
});

test("invalid and unconfigured tenants are rejected", () => {
  assert.equal(normalizeTenantSlug("not a slug"), null);
  assert.equal(resolveConfiguredTenant("random-store"), null);
  assert.equal(resolveConfiguredTenant("public"), null);
});

test("public can never be used as a tenant migration schema", () => {
  assert.throws(() => assertSafeTenantSchema("public"), /Unsafe tenant schema/);
});

test("public-qualified Drizzle SQL is scoped to the tenant schema", () => {
  const sql = 'CREATE TYPE "public"."status" AS ENUM (\'active\');';
  const scoped = scopeMigrationSql(sql, "panda_pop");

  assert.equal(
    scoped,
    'CREATE TYPE "panda_pop"."status" AS ENUM (\'active\');'
  );
  assert.doesNotMatch(scoped, /public/);
});

test("all checked-in Drizzle SQL migrations can be tenant-scoped", async () => {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  const migrations = await readDrizzleMigrations(
    path.join(repositoryRoot, "src", "drizzle", "migrations")
  );

  assert.ok(migrations.length > 0);
  for (const migration of migrations) {
    assert.doesNotMatch(scopeMigrationSql(migration.sql, "gift_shop"), /public/);
  }
});
