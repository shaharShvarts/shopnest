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

test("custom-domain rollback action requires super admin itself", async () => {
  const actions = await source("src/app/admin/_actions/stores.ts");
  const start = actions.indexOf("rollbackCustomDomainAction");
  assert.ok(start >= 0, "rollbackCustomDomainAction is missing");
  const action = actions.slice(start);
  assert.match(action, /requireSuperAdmin\(\)/);
  assert.match(action, /rollbackRetiringDomainForAdmin/);
  assert.doesNotMatch(
    action,
    /merchantAccountId|organizationId|schemaName|providerHostnameId/
  );
});

test("merchant custom-domain actions do not expose rollback", async () => {
  const actions = await source(
    "src/app/(merchant)/dashboard/stores/[id]/domain/_actions.ts"
  );
  assert.doesNotMatch(actions, /rollbackCustomDomain/i);
});

test("Super Admin store page exposes rollback only through trusted lifecycle state", async () => {
  const page = await source("src/app/admin/stores/[slug]/page.tsx");
  assert.match(page, /getCustomDomainAdminSummary/);
  assert.match(page, /rollbackCustomDomainAction/);
  assert.match(page, /retiring/);
  assert.match(page, /retireAt/);
  assert.doesNotMatch(page, /providerHostnameId.*form|schemaName.*form/s);
});

test("operator rollback accepts only tenant slug and restore hostname", async () => {
  const cli = await source("scripts/domain-rollback.mts");
  assert.match(cli, /--tenant-slug/);
  assert.match(cli, /--restore-hostname/);
  assert.doesNotMatch(cli, /--schema|--provider-id|--provider-hostname-id/);
  assert.match(cli, /rollbackRetiringDomainForAdmin/);
});
