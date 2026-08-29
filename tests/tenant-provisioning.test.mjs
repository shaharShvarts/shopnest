import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  normalizeTenantSlug,
  resolveConfiguredTenant,
} from "../src/lib/tenant-validation.mjs";
import {
  assertMigrationHash,
  assertSafeTenantSchema,
  assertTenantMigrationSql,
  hashMigrationSql,
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

test("control-plane tables cannot be included in tenant migrations", () => {
  assert.throws(
    () =>
      assertTenantMigrationSql(
        "admin.sql",
        'CREATE TABLE "admin_sessions" ("id" uuid);'
      ),
    /contains a control-plane table/
  );
  assert.doesNotThrow(() =>
    assertTenantMigrationSql(
      "products.sql",
      'CREATE TABLE "products" ("id" integer);'
    )
  );
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

test("LF and CRLF migration SQL produce the same normalized hash", () => {
  const lfSql = "CREATE TABLE products (id integer);\nSELECT 1;\n";
  const crlfSql = lfSql.replaceAll("\n", "\r\n");

  assert.equal(hashMigrationSql(lfSql), hashMigrationSql(crlfSql));
});

test("a real SQL content change produces a different migration hash", () => {
  const originalSql = "CREATE TABLE products (id integer);\n";
  const changedSql = "CREATE TABLE products (id bigint);\n";

  assert.notEqual(hashMigrationSql(originalSql), hashMigrationSql(changedSql));
  assert.throws(
    () =>
      assertMigrationHash(
        "0001_products.sql",
        hashMigrationSql(originalSql),
        changedSql
      ),
    /changed after it was applied/
  );
});

test("an existing LF migration hash accepts a CRLF checkout", () => {
  const lfSql = "CREATE TABLE orders (id integer);\nALTER TABLE orders ADD total integer;\n";
  const storedLfHash = hashMigrationSql(lfSql);
  const checkedOutCrlfSql = lfSql.replaceAll("\n", "\r\n");

  assert.doesNotThrow(() =>
    assertMigrationHash(
      "0002_orders.sql",
      storedLfHash,
      checkedOutCrlfSql
    )
  );
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
    assertTenantMigrationSql(migration.fileName, migration.sql);
    assert.doesNotMatch(scopeMigrationSql(migration.sql, "gift_shop"), /public/);
  }
});

test("public control-plane migrations are stored separately", async () => {
  const repositoryRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    ".."
  );
  const controlMigrations = await readDrizzleMigrations(
    path.join(repositoryRoot, "src", "drizzle", "control-migrations")
  );
  const tenantMigrations = await readDrizzleMigrations(
    path.join(repositoryRoot, "src", "drizzle", "migrations")
  );

  assert.match(controlMigrations.map((migration) => migration.sql).join("\n"), /admin_users/);
  assert.doesNotMatch(
    tenantMigrations.map((migration) => migration.sql).join("\n"),
    /admin_users|admin_sessions|admin_user_tenants/
  );
});
