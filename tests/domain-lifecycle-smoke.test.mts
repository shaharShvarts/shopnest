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

test("domain lifecycle smoke requires explicit store, action and hostname inputs", async () => {
  const script = await source("scripts/domain-lifecycle-smoke.mts");
  assert.match(script, /--store-id/);
  assert.match(script, /--action/);
  assert.match(script, /--hostname/);
  assert.doesNotMatch(script, /--schema|--provider-id|--provider-hostname-id/);
});

test("domain lifecycle smoke executes one action and never polls", async () => {
  const script = await source("scripts/domain-lifecycle-smoke.mts");
  assert.doesNotMatch(script, /setInterval|while\s*\(\s*true\s*\)/);
  assert.doesNotMatch(script, /setTimeout[\s\S]{0,100}(?:300000|300_000)/);
  assert.match(
    script,
    /start-claim|check-txt|check-cname|check-provider|remove|show/
  );
});

test("package exposes rollback, smoke and merchant-domain test commands", async () => {
  const pkg = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(
    pkg.scripts["domain:rollback"],
    "npx --yes tsx --conditions=react-server scripts/domain-rollback.mts"
  );
  assert.equal(
    pkg.scripts["domain-lifecycle:smoke"],
    "npx --yes tsx --conditions=react-server scripts/domain-lifecycle-smoke.mts"
  );
  assert.match(pkg.scripts["merchant-domain:test"] ?? "", /custom-domain-admin/);
  assert.match(pkg.scripts["merchant-domain:test"] ?? "", /domain-lifecycle-smoke/);
});
