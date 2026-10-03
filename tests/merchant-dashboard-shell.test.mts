import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("merchant dashboard has a shared authenticated tenant-independent shell", async () => {
  const layout = await readFile(
    "src/app/(merchant)/dashboard/layout.tsx",
    "utf8"
  );

  assert.match(layout, /requireStoreDashboardPrincipal\(\)/);
  assert.match(layout, /DashboardNavigation/);
  assert.match(layout, /role=\{principal\.kind\}/);
  assert.match(layout, /logoutDashboardAction/);
  assert.match(layout, /getTranslations\(["']MerchantDashboard["']\)/);
  assert.doesNotMatch(
    layout,
    /getDbForTenant|getTenant\(|TenantLink|TENANT_SCHEMA_HEADER|search_path/
  );
});

test("merchant dashboard navigation exposes the approved global destinations", async () => {
  const navigation = await readFile(
    "src/app/(merchant)/dashboard/_components/DashboardNavigation.tsx",
    "utf8"
  );

  assert.match(navigation, /usePathname\(\)/);
  assert.match(navigation, /ownerItems/);
  assert.match(navigation, /managerItems/);
  assert.match(navigation, /href:\s*["']\/dashboard["']/);
  assert.match(navigation, /href:\s*["']\/dashboard\/business["']/);
  assert.match(navigation, /href:\s*["']\/dashboard\/stores["']/);
  assert.match(navigation, /role === "owner" \? ownerItems : managerItems/);
  assert.match(navigation, /aria-current/);
  assert.doesNotMatch(
    navigation,
    /TenantLink|getDbForTenant|getTenant\(|TENANT_SCHEMA_HEADER|search_path/
  );
});

test("merchant dashboard shell translations stay aligned", async () => {
  const [en, he] = await Promise.all([
    readFile("src/messages/en.json", "utf8").then(JSON.parse),
    readFile("src/messages/he.json", "utf8").then(JSON.parse),
  ]);

  assert.ok(en.MerchantDashboard);
  assert.ok(he.MerchantDashboard);
  assert.deepEqual(
    Object.keys(en.MerchantDashboard).sort(),
    Object.keys(he.MerchantDashboard).sort()
  );

  for (const key of [
    "workspace",
    "overview",
    "business",
    "stores",
    "navigation",
    "signedInAs",
    "managerGreeting",
    "managerDetail",
    "assignedStores",
    "managerPhaseOneDetail",
    "managerRole",
  ]) {
    assert.equal(typeof en.MerchantDashboard[key], "string");
    assert.equal(typeof he.MerchantDashboard[key], "string");
  }
});

test("dashboard overview no longer owns shell logout framing", async () => {
  const page = await readFile(
    "src/app/(merchant)/dashboard/page.tsx",
    "utf8"
  );

  assert.doesNotMatch(page, /logoutDashboardAction/);
  assert.doesNotMatch(page, /<form\s+action=\{logoutDashboardAction\}/);
  assert.match(page, /principal\.kind === "manager"/);
  assert.match(page, /getStoreManagementRepository/);
  assert.match(page, /getMerchantOrganizationRepository/);
  assert.match(page, /getMerchantStoreRepository/);
});
