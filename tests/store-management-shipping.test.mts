import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const actionsPath =
  "src/app/(merchant)/dashboard/stores/[id]/_actions/shipping.ts";

test("shipping actions use Store Management shipping permission", async () => {
  const source = await readFile(actionsPath, "utf8");

  assert.match(
    source,
    /requireStoreManagementDb\(\s*storeId,\s*"shipping\.manage"\s*\)/
  );
});

test("shipping actions validate complete server-side payloads with Zod", async () => {
  const source = await readFile(actionsPath, "utf8");

  assert.match(source, /z\.object\(/);
  assert.match(source, /name:/);
  assert.match(source, /price:/);
  assert.match(source, /requiresAddress:/);
  assert.match(source, /isActive:/);
  assert.match(source, /\.parse\(|\.safeParse\(/);
});

test("shipping actions do not trust browser tenant or schema authority", async () => {
  const source = await readFile(actionsPath, "utf8");

  assert.doesNotMatch(source, /formData\.get\(["'](?:tenant|tenantSlug|schema|schemaName)["']\)/);
  assert.doesNotMatch(source, /getDbForTenant\(/);
  assert.doesNotMatch(source, /search_path|TENANT_SCHEMA_HEADER/);
});

test("shipping actions use Drizzle CRUD and ordering lock", async () => {
  const source = await readFile(actionsPath, "utf8");

  assert.match(source, /\.insert\(shippingMethods\)/);
  assert.match(source, /\.update\(shippingMethods\)/);
  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /reorderShippingMethods/);
});

test("shipping logo storage is scoped to the authorized Store tenant", async () => {
  const source = await readFile(actionsPath, "utf8");

  assert.match(source, /saveCatalogImage/);
  assert.match(source, /deleteCatalogImage/);
  assert.match(source, /kind:\s*"shipping"/);
  assert.match(source, /trustedMediaResolver/);
  assert.match(source, /resolveTenant/);
  assert.doesNotMatch(source, /resolveConfiguredTenant/);
});

test("shipping edit reads the persisted logo before replacing or removing it", async () => {
  const source = await readFile(actionsPath, "utf8");

  assert.match(source, /logoUrl:\s*shippingMethods\.logoUrl/);
  assert.match(source, /removeLogo/);
  assert.match(source, /deleteCatalogImage/);
  assert.doesNotMatch(
    source,
    /formData\.get\(["'](?:logoUrl|existingLogoUrl|imageUrl)["']\)/
  );
});

test("managed shipping page remains Store-scoped server authority", async () => {
  const page = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/shipping/page.tsx",
    "utf8"
  );

  assert.match(
    page,
    /requireStoreManagementDb\(\s*storeId,\s*"shipping\.manage"\s*\)/
  );
  assert.doesNotMatch(page, /["']use client["']/);
});

test("managed shipping form uses shared controls and the flexible shipping model", async () => {
  const form = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/shipping/_components/ShippingMethodForm.tsx",
    "utf8"
  );

  assert.match(form, /ManagementInput/);
  assert.match(form, /size="management"/);
  assert.match(form, /name="name"/);
  assert.match(form, /name="price"/);
  assert.match(form, /name="requiresAddress"/);
  assert.match(form, /ManagedImageUpload/);
  assert.doesNotMatch(form, /name="isActive"/);

  assert.doesNotMatch(form, /name="code"/);
  assert.doesNotMatch(form, /name="type"/);
  assert.doesNotMatch(form, /freeShippingThreshold/);
});

test("Owner and Manager dashboards expose Store shipping management", async () => {
  const [ownerStore, managerDashboard] = await Promise.all([
    readFile("src/app/(merchant)/dashboard/stores/[id]/page.tsx", "utf8"),
    readFile("src/app/(merchant)/dashboard/page.tsx", "utf8"),
  ]);

  assert.match(ownerStore, /\/shipping/);
  assert.match(managerDashboard, /\/shipping/);
});

test("shipping management has English and Hebrew messages", async () => {
  const [english, hebrew] = await Promise.all([
    readFile("src/messages/en.json", "utf8"),
    readFile("src/messages/he.json", "utf8"),
  ]);

  assert.match(english, /"StoreShippingManagement"/);
  assert.match(hebrew, /"StoreShippingManagement"/);
});

test("shipping price parser does not coerce an empty value to zero", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/_actions/shipping.ts",
    "utf8"
  );

  assert.match(source, /z\.preprocess/);
  assert.match(source, /trim\(\)\s*===\s*""/);
});

test("checkout shipping options render the optional shipping logo", async () => {
  const source = await readFile(
    "src/app/[tenant]/(storefront)/checkout/_components/CheckoutTable.tsx",
    "utf8"
  );

  assert.match(source, /method\.logoUrl/);
  assert.match(source, /alt=\{method\.name\}/);
});

test("shipping list uses shared sortable drag-and-drop and management switch", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/shipping/page.tsx",
    "utf8"
  );

  assert.match(source, /ShippingMethodOrderList/);
  assert.doesNotMatch(source, /name="direction"/);
  assert.doesNotMatch(source, /moveUp|moveDown/);
});

test("shipping reorder interaction uses dnd-kit and autosaves through server mutation", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/shipping/_components/ShippingMethodOrderList.tsx",
    "utf8"
  );

  assert.match(source, /@dnd-kit\/core/);
  assert.match(source, /@dnd-kit\/sortable/);
  assert.match(source, /ManagementSwitch/);
  assert.match(source, /reorderManagedShippingMethods/);
  assert.match(source, /toggleManagedShippingMethod/);
  assert.match(source, /toast/);
  assert.match(source, /router\.refresh/);
});

test("shipping edit form reuses the established managed image upload pattern", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/shipping/_components/ShippingMethodForm.tsx",
    "utf8"
  );

  assert.match(source, /ManagedImageUpload/);
  assert.doesNotMatch(source, /type="file"/);
  assert.doesNotMatch(source, /name="isActive"/);
  assert.doesNotMatch(source, /Available at checkout/);
});

test("ShopNest exposes a reusable management switch control", async () => {
  const source = await readFile(
    "src/components/management/ManagementSwitch.tsx",
    "utf8"
  );

  assert.match(source, /role="switch"/);
  assert.match(source, /aria-checked/);
});
