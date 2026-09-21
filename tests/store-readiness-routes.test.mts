import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Store detail renders server-authoritative readiness checklist", async () => {
  const page = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/page.tsx",
    "utf8"
  );

  assert.match(page, /getStoreReadinessRepository/);
  assert.match(page, /evaluateForOwnedStore/);
  assert.match(page, /MerchantReadiness/);
  assert.match(page, /\/policies/);
  assert.doesNotMatch(
    page,
    /getDbForTenant|getTenant\(|TENANT_SCHEMA_HEADER|search_path/
  );
});

test("completed policy readiness still links to policy management", async () => {
  const page = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/page.tsx",
    "utf8"
  );

  assert.match(page, /requirement\.key === "policies"/);
  assert.match(page, /managePolicies/);
  assert.match(page, /\/policies/);
});

test("policy actions derive authority server-side", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/policies/_actions.ts",
    "utf8"
  );

  assert.match(source, /requireMerchantPage\(\)/);
  assert.match(source, /parseStoreId/);
  assert.match(source, /parsePolicyDocumentInput/);
  assert.match(source, /saveDraftForOwnedStore/);
  assert.match(source, /publishForOwnedStore/);
  assert.doesNotMatch(
    source,
    /formData\.get\(["'](?:organizationId|market|status|version|tenantId|schemaName)/
  );
  assert.doesNotMatch(
    source,
    /getDbForTenant|getTenant\(|TENANT_SCHEMA_HEADER|search_path/
  );
});

test("policy page is an authenticated merchant Store surface", async () => {
  const page = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/policies/page.tsx",
    "utf8"
  );

  assert.match(page, /requireMerchantPage\(\)/);
  assert.match(page, /getWorkspaceForOwnedStore/);
  assert.match(page, /PolicyDocumentForm/);
  assert.match(page, /policyType=\{policyType\}/);
  assert.doesNotMatch(
    page,
    /getDbForTenant|getTenant\(|TENANT_SCHEMA_HEADER|search_path/
  );
});

test("policy form avoids per-keystroke native validation popups", async () => {
  const form = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/policies/PolicyDocumentForm.tsx",
    "utf8"
  );

  assert.match(form, /noValidate/);
  assert.match(form, /MIN_POLICY_CONTENT_LENGTH = 80/);
  assert.match(form, /trimmedContentLength/);
  assert.match(form, /disabled=\{!canSubmit\}/);
  assert.match(form, /characterCount/);
  assert.doesNotMatch(form, /minLength=\{80\}/);
});

test("invalid policy content returns to the policy workspace", async () => {
  const actions = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/policies/_actions.ts",
    "utf8"
  );

  assert.match(actions, /parsePolicyFormForStore/);
  assert.match(
    actions,
    /\/dashboard\/stores\/" \+ storeId \+ "\/policies\?policy=invalid/
  );
});

test("readiness and policy translations stay aligned", async () => {
  const [en, he] = await Promise.all([
    readFile("src/messages/en.json", "utf8").then(JSON.parse),
    readFile("src/messages/he.json", "utf8").then(JSON.parse),
  ]);

  for (const namespace of ["MerchantReadiness", "MerchantPolicies"]) {
    assert.ok(en[namespace]);
    assert.ok(he[namespace]);
    assert.deepEqual(
      Object.keys(en[namespace]).sort(),
      Object.keys(he[namespace]).sort()
    );
  }
});
