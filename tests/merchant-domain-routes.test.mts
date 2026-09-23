import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path: string) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
  }
}

test("merchant custom-domain route files exist and derive authority server-side", async () => {
  const [page, actions, repository] = await Promise.all([
    source("src/app/(merchant)/dashboard/stores/[id]/domain/page.tsx"),
    source("src/app/(merchant)/dashboard/stores/[id]/domain/_actions.ts"),
    source("src/lib/merchant-domains/drizzle-repository.ts"),
  ]);

  assert.match(page, /requireMerchantPage\(\)/);
  assert.match(page, /parseStoreId/);
  assert.match(actions, /requireMerchantPage\(\)/);
  assert.match(actions, /parseStoreId/);
  assert.match(repository, /organizationMemberships/);
  assert.match(repository, /merchantAccountId/);
  assert.match(repository, /stores\.id/);
  assert.doesNotMatch(
    actions,
    /tenantId:\s*formData|schemaName:\s*formData|providerHostnameId:\s*formData|lifecycleRole:\s*formData/
  );
  assert.doesNotMatch(
    page + actions + repository,
    /getDbForTenant|TENANT_SCHEMA_HEADER|search_path/
  );
});

test("merchant custom-domain actions use the approved service boundaries", async () => {
  const actions = await source(
    "src/app/(merchant)/dashboard/stores/[id]/domain/_actions.ts"
  );

  assert.match(actions, /getDomainOwnershipClaimService/);
  assert.match(actions, /verifyClaim/);
  assert.match(actions, /verifyCname/);
  assert.match(actions, /getCloudflareDomainProvisioningService/);
  assert.match(actions, /provisionVerifiedClaim/);
  assert.match(actions, /getCustomDomainLifecycleService/);
  assert.match(actions, /checkOwnedCandidate/);
  assert.match(actions, /getCloudflareDomainRemovalService/);
  assert.match(actions, /removeOwnedDomain/);
  assert.doesNotMatch(actions, /rollback/i);
});

test("merchant domain client uses timers only for countdown display and never polls services", async () => {
  const ui = await source(
    "src/app/(merchant)/dashboard/stores/[id]/domain/DomainManager.tsx"
  );

  assert.match(ui, /["']use client["']/);
  assert.match(ui, /setInterval/);
  assert.match(ui, /1_000|1000/);
  assert.doesNotMatch(ui, /setInterval\([^,]+,\s*(?:5000|5_000|300000|300_000)/);
  assert.doesNotMatch(
    ui,
    /setInterval[\s\S]{0,500}(?:checkDomainTxtAction|checkDomainCnameAction|checkDomainProviderAction)/
  );
});

test("merchant domain read model never returns the ownership token hash", async () => {
  const [core, repository] = await Promise.all([
    source("src/lib/merchant-domains/core.ts"),
    source("src/lib/merchant-domains/drizzle-repository.ts"),
  ]);

  assert.match(core, /export type MerchantDomainView/);
  assert.match(core, /nextTxtCheckAt/);
  assert.match(core, /nextCnameCheckAt/);
  assert.match(repository, /storeDomainClaims/);
  assert.doesNotMatch(core + repository, /verificationTokenHash/);
});

test("merchant custom-domain translations are complete in English and Hebrew", async () => {
  const [en, he] = await Promise.all([
    readFile("src/messages/en.json", "utf8").then(JSON.parse),
    readFile("src/messages/he.json", "utf8").then(JSON.parse),
  ]);

  assert.ok(en.MerchantDomain);
  assert.ok(he.MerchantDomain);
  assert.deepEqual(
    Object.keys(en.MerchantDomain).sort(),
    Object.keys(he.MerchantDomain).sort()
  );

  for (const key of [
    "title",
    "currentAddress",
    "setupIntro",
    "dnsProviderHelp",
    "abandonSafe",
    "verifyOwnership",
    "verifyCname",
    "provisionSsl",
    "checkNow",
    "createNewCode",
    "txtNotReady",
    "cnameTarget",
    "statusActive",
    "statusPending",
    "removeDomain",
    "tokenNotStored",
  ]) {
    assert.equal(typeof en.MerchantDomain[key], "string");
    assert.equal(typeof he.MerchantDomain[key], "string");
  }
});

test("provisioned Store detail links to its domain manager", async () => {
  const page = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/page.tsx",
    "utf8"
  );
  assert.match(page, /\/dashboard\/stores\/["']?\s*\+\s*store\.id\s*\+\s*["']\/domain/);
  assert.match(page, /manageDomain/);
});
