import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("organization actions derive identity and ownership from the merchant session", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/business/_actions.ts",
    "utf8"
  );

  assert.match(source, /requireMerchantPage\(\)/);
  assert.match(source, /getMerchantOrganizationRepository/);
  assert.match(source, /organizationProfileSchema/);
  assert.match(source, /createFirstWithOwner/);
  assert.match(source, /findFirstForMerchant/);
  assert.match(source, /updateOwned/);
  assert.doesNotMatch(
    source,
    /formData\.get\(["']merchantAccountId|formData\.get\(["']role|formData\.get\(["']organizationId/
  );
  assert.doesNotMatch(
    source,
    /getDbForTenant|getTenant\(|schemaName|tenantSlug|TENANT_SCHEMA_HEADER/
  );
});

test("organization form parsing strips browser supplied ownership fields", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/business/_actions.ts",
    "utf8"
  );
  assert.match(source, /organizationProfileSchema\.safeParse/);
  assert.match(source, /Object\.fromEntries\(formData\)/);
  assert.doesNotMatch(source, /merchantAccountId:\s*parsed|role:\s*parsed/);
});
