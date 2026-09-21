import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("merchant Store plan action derives ownership server-side", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/_actions.ts",
    "utf8"
  );

  assert.match(source, /requireMerchantPage\(\)/);
  assert.match(source, /parseStoreId/);
  assert.match(source, /parsePlanSelection/);
  assert.match(source, /selectPlanForOwnedStore/);
  assert.doesNotMatch(
    source,
    /formData\.get\(["'](?:organizationId|merchantAccountId|tenantId|schemaName|status|subscriptionId)/
  );
  assert.doesNotMatch(
    source,
    /getDbForTenant|getTenant\(|TENANT_SCHEMA_HEADER|search_path/
  );
});

test("owned Store detail exposes plan selection without tenant access", async () => {
  const page = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/page.tsx",
    "utf8"
  );

  assert.match(page, /getMerchantSubscriptionRepository/);
  assert.match(page, /listActivePlans/);
  assert.match(page, /findForOwnedStore/);
  assert.match(page, /selectStorePlanAction/);
  assert.match(page, /name="planCode"/);
  assert.doesNotMatch(
    page,
    /getDbForTenant|getTenant\(|TenantLink|TENANT_SCHEMA_HEADER|search_path/
  );
});

test("merchant subscription translations stay aligned", async () => {
  const [en, he] = await Promise.all([
    readFile("src/messages/en.json", "utf8").then(JSON.parse),
    readFile("src/messages/he.json", "utf8").then(JSON.parse),
  ]);

  assert.ok(en.MerchantSubscription);
  assert.ok(he.MerchantSubscription);
  assert.deepEqual(
    Object.keys(en.MerchantSubscription).sort(),
    Object.keys(he.MerchantSubscription).sort()
  );

  for (const key of [
    "plan",
    "selectPlan",
    "savePlan",
    "notSelected",
    "pending",
    "selectionHelp",
    "selectionSaved",
  ]) {
    assert.equal(typeof en.MerchantSubscription[key], "string");
    assert.equal(typeof he.MerchantSubscription[key], "string");
  }
});
