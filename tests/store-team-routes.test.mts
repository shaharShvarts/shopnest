import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Store detail exposes team management for owners", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/page.tsx",
    "utf8"
  );
  assert.match(source, /\/dashboard\/stores\/.*\/team/);
  assert.match(source, /manageTeam/);
});

test("team page exposes quota, upgrade visibility and manager operations", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/team/page.tsx",
    "utf8"
  );

  assert.match(source, /getOwnedStoreManagerQuota/);
  assert.match(source, /listStoreManagerPlanOptions/);
  assert.match(source, /limitReachedTitle/);
  assert.match(source, /createStoreManagerAction/);
  assert.match(source, /assignExistingStoreManagerAction/);
  assert.match(source, /removeStoreManagerAction/);
});

test("team mutations are owner-authorized server-side", async () => {
  const source = await readFile("src/lib/store-team/server.ts", "utf8");
  assert.match(source, /requireOwnerStoreManagementContext\(storeId, "team\.manage"\)/);
});
