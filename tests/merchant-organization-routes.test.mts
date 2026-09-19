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


test("merchant business pages are global, protected, and tenant-independent", async () => {
  const [dashboard, business, create, edit] = await Promise.all([
    readFile("src/app/(merchant)/dashboard/page.tsx", "utf8"),
    readFile("src/app/(merchant)/dashboard/business/page.tsx", "utf8"),
    readFile("src/app/(merchant)/dashboard/business/new/page.tsx", "utf8"),
    readFile("src/app/(merchant)/dashboard/business/edit/page.tsx", "utf8"),
  ]);

  for (const source of [dashboard, business, create, edit]) {
    assert.match(source, /requireMerchantPage\(\)/);
    assert.doesNotMatch(
      source,
      /getDbForTenant|getTenant\(|TenantLink|tenantSlug|schemaName/
    );
  }

  assert.match(dashboard, /findFirstForMerchant/);
  assert.match(dashboard, /\/dashboard\/business\/new/);
  assert.match(dashboard, /\/dashboard\/business/);
  assert.match(create, /OrganizationForm/);
  assert.match(edit, /OrganizationForm/);
  assert.match(business, /\/dashboard\/business\/edit/);
});

test("business form exposes profile fields but no authority fields", async () => {
  const form = await readFile(
    "src/app/(merchant)/dashboard/business/_components/OrganizationForm.tsx",
    "utf8"
  );

  for (const name of [
    "displayName",
    "legalName",
    "businessNumber",
    "vatNumber",
    "email",
    "phone",
    "country",
  ]) {
    assert.match(form, new RegExp(`name=["']${name}["']`));
  }

  assert.doesNotMatch(
    form,
    /name=["'](?:merchantAccountId|organizationId|role)["']/
  );
});

test("merchant organization translations stay aligned", async () => {
  const [en, he] = await Promise.all([
    readFile("src/messages/en.json", "utf8").then(JSON.parse),
    readFile("src/messages/he.json", "utf8").then(JSON.parse),
  ]);

  assert.deepEqual(
    Object.keys(en.MerchantOrganization).sort(),
    Object.keys(he.MerchantOrganization).sort()
  );
});
