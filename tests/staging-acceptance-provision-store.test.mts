import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

test("staging acceptance provisioning helper is hard-gated to explicit staging", async () => {
  const source = await readFile(
    new URL("../scripts/staging-acceptance-provision-store.mts", import.meta.url),
    "utf8"
  );

  assert.match(source, /SHOPNEST_STAGING_ACCEPTANCE/);
  assert.match(source, /db-staging/);
  assert.match(source, /medium/);
  assert.match(source, /large/);
  assert.match(source, /syncReadinessForOwnedStore/);
  assert.match(source, /requestActivationForOwnedStore/);
  assert.match(source, /startProvisioning/);
  assert.match(source, /provisionTenant/);
  assert.match(source, /finalizeProvisioning/);
  assert.match(source, /markProvisioningFailed/);
});


test("staging acceptance guard exits cleanly without a stack trace", () => {
  const result = spawnSync(
    "npx",
    [
      "--yes",
      "tsx",
      "--conditions=react-server",
      "scripts/staging-acceptance-provision-store.mts",
      "1",
      "4",
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        SHOPNEST_STAGING_ACCEPTANCE: "false",
        DB_HOST: "db-staging",
      },
      encoding: "utf8",
    }
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /blocked: true/);
  assert.match(result.stdout, /code: STAGING_ACCEPTANCE_DISABLED/);
  assert.match(
    result.stdout,
    /message: STAGING acceptance provisioning is disabled outside the explicit db-staging environment/
  );
  assert.doesNotMatch(result.stderr, /requireStagingAcceptanceEnvironment/);
  assert.doesNotMatch(result.stderr, /\n\s+at /);
});
