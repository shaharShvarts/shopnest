import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionsPath =
  "src/app/(merchant)/dashboard/stores/[id]/_actions/shipping.ts";

test("shipping actions use Store Management shipping permission", async () => {
  const source = await readFile(actionsPath, "utf8");

  assert.match(
    source,
    /requireStoreManagementDb\(\s*storeId,\s*"shipping\.manage"\s*\)/
  );
});

test("shipping actions validate complete server-side payloads with Zod", async () => {
  const source = await readFile(actionsPath, "utf8");

  assert.match(source, /z\.object\(/);
  assert.match(source, /name:/);
  assert.match(source, /price:/);
  assert.match(source, /requiresAddress:/);
  assert.match(source, /isActive:/);
  assert.match(source, /\.parse\(|\.safeParse\(/);
});

test("shipping actions do not trust browser tenant or schema authority", async () => {
  const source = await readFile(actionsPath, "utf8");

  assert.doesNotMatch(source, /formData\.get\(["'](?:tenant|tenantSlug|schema|schemaName)["']\)/);
  assert.doesNotMatch(source, /getDbForTenant\(/);
  assert.doesNotMatch(source, /search_path|TENANT_SCHEMA_HEADER/);
});

test("shipping actions use Drizzle CRUD and ordering lock", async () => {
  const source = await readFile(actionsPath, "utf8");

  assert.match(source, /\.insert\(shippingMethods\)/);
  assert.match(source, /\.update\(shippingMethods\)/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /reorderShippingMethods/);
});

test("shipping logo storage is scoped to the authorized Store tenant", async () => {
  const source = await readFile(actionsPath, "utf8");

  assert.match(source, /saveCatalogImage/);
  assert.match(source, /deleteCatalogImage/);
  assert.match(source, /kind:\s*"shipping"/);
  assert.match(source, /trustedMediaResolver/);
  assert.match(source, /resolveTenant/);
  assert.doesNotMatch(source, /resolveConfiguredTenant/);
});

test("shipping edit reads the persisted logo before replacing or removing it", async () => {
  const source = await readFile(actionsPath, "utf8");

  assert.match(source, /logoUrl:\s*shippingMethods\.logoUrl/);
  assert.match(source, /removeLogo/);
  assert.match(source, /deleteCatalogImage/);
  assert.doesNotMatch(
    source,
    /formData\.get\(["'](?:logoUrl|existingLogoUrl|imageUrl)["']\)/
  );
});
