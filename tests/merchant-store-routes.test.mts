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

test("delete returns server-issued Undo version and expiry", async () => {
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
  assert.match(availability, /validateStoreSlug/);
});
