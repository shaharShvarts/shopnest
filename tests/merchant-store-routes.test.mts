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
  assert.match(form, /validateStoreSlug/);
  assert.match(form, /checkStoreSlugAvailabilityAction/);
  assert.match(form, /shopnest\.co\.il/);
  assert.match(form, /readOnly/);
  assert.doesNotMatch(
    form,
    /name=["'](?:merchantAccountId|organizationId|tenantId|schemaName|role|status)["']/
  );
});

test("draft Store edit keeps slug synced with name until slug is edited", async () => {
  const form = await readFile(
    "src/app/(merchant)/dashboard/stores/_components/StoreForm.tsx",
    "utf8"
  );

  assert.match(
    form,
    /const \[slugEdited, setSlugEdited\] = useState\(false\)/
  );
  assert.match(
    form,
    /if \(!slugEdited && !slugLocked\) \{\s*setSlug\(suggestStoreSlug\(value\)\);/
  );
  assert.match(form, /setSlugEdited\(true\)/);
  assert.match(form, /readOnly=\{slugLocked\}/);
});

test("MerchantStore translations stay aligned", async () => {
  const [en, he] = await Promise.all([
    readFile("src/messages/en.json", "utf8").then(JSON.parse),
    readFile("src/messages/he.json", "utf8").then(JSON.parse),
  ]);

  assert.ok(en.MerchantStore);
  assert.ok(he.MerchantStore);
  assert.deepEqual(
    Object.keys(en.MerchantStore).sort(),
    Object.keys(he.MerchantStore).sort()
  );
});


test("Store list translation keys exist in both locales", async () => {
  const [source, en, he] = await Promise.all([
    readFile(
      "src/app/(merchant)/dashboard/stores/_components/StoreList.tsx",
      "utf8"
    ),
    readFile("src/messages/en.json", "utf8").then(JSON.parse),
    readFile("src/messages/he.json", "utf8").then(JSON.parse),
  ]);

  for (const key of ["viewStore"]) {
    assert.match(source, new RegExp(`t\\(["']${key}["']\\)`));
    assert.equal(typeof en.MerchantStore[key], "string");
    assert.equal(typeof he.MerchantStore[key], "string");
  }
});


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
  assert.match(source, /setStoreVersions/);
  assert.match(source, /result\.updatedAt/);
  assert.match(source, /autoClose:\s*10_000/);
  assert.match(source, /closeOnClick:\s*false/);
  assert.match(source, /closeButton:\s*false/);
  assert.match(source, /undoVersion/);
  assert.match(source, /router\.refresh\(\)/);
  assert.match(source, /deleteBlocked/);
});


test("provisioned Store exposes the merchant custom-domain manager route", async () => {
  const [detail, domainPage, domainActions] = await Promise.all([
    readFile("src/app/(merchant)/dashboard/stores/[id]/page.tsx", "utf8"),
    readFile("src/app/(merchant)/dashboard/stores/[id]/domain/page.tsx", "utf8"),
    readFile("src/app/(merchant)/dashboard/stores/[id]/domain/_actions.ts", "utf8"),
  ]);

  assert.match(detail, /\/dashboard\/stores\/["']?\s*\+\s*store\.id\s*\+\s*["']\/domain|\/dashboard\/stores\/.*\/domain/);
  assert.match(domainPage, /requireMerchantPage\(\)/);
  assert.match(domainActions, /requireMerchantPage\(\)/);
  assert.doesNotMatch(
    domainActions,
    /tenantId:\s*formData|schemaName:\s*formData|providerHostnameId:\s*formData|lifecycleRole:\s*formData/
  );
});
