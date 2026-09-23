import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";

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



test("staging acceptance guard has clean operator-facing blocked output", async () => {
  const source = await readFile(
    new URL("../scripts/staging-acceptance-provision-store.mts", import.meta.url),
    "utf8"
  );

  assert.match(source, /blocked: true/);
  assert.match(source, /code: STAGING_ACCEPTANCE_DISABLED/);
  assert.match(
    source,
    /message: STAGING acceptance provisioning is disabled outside the explicit db-staging environment/
  );
  assert.doesNotMatch(source, /throw new Error\(\s*["']STAGING acceptance provisioning is disabled outside the explicit db-staging environment/);
});
