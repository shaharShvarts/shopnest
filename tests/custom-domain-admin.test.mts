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
  assert.doesNotMatch(
    page,
    /name=["'](?:schemaName|providerHostnameId|providerHostnameStatus|lifecycleRole)["']/
  );
});

test("operator rollback accepts only tenant slug and restore hostname", async () => {
  const cli = await source("scripts/domain-rollback.mts");
  assert.match(cli, /--tenant-slug/);
  assert.match(cli, /--restore-hostname/);
  assert.doesNotMatch(cli, /--schema|--provider-id|--provider-hostname-id/);
  assert.match(cli, /rollbackRetiringDomainForAdmin/);
});


test("custom-domain middleware normalizes tenant-prefixed media for the bound tenant", async () => {
  const middleware = await source("src/middleware.ts");

  assert.match(middleware, /tenantMediaPrefix/);
  assert.match(middleware, /\/\$\{domain\.tenant\.slug\}\/media\//);
  assert.match(middleware, /startsWith\(tenantMediaPrefix\)/);
  assert.match(
    middleware,
    /slice\(domain\.tenant\.basePath\.length\)/
  );
  assert.match(middleware, /routeMode = "host"/);
});


test("normalized custom-domain media handlers are rewritten", async () => {
  const middleware = await source("src/middleware.ts");

  assert.match(middleware, /normalizedHostedHandlerPath/);
  assert.match(
    middleware,
    /isTenantHandlerPath\(internalPath\)\s*&&\s*internalPath !== req\.nextUrl\.pathname/
  );
  assert.match(
    middleware,
    /normalizedHostedHandlerPath[\s\S]*NextResponse\.rewrite/
  );
});
