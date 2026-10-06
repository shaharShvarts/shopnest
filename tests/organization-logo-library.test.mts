import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Organization logo assets are control-plane scoped and deduplicated per Organization", async () => {
  const [schema, migration] = await Promise.all([
    readFile("src/drizzle/control-schema/organizationLogoAsset.ts", "utf8"),
    readFile(
      "src/drizzle/control-migrations/0026_organization_logo_assets.sql",
      "utf8"
    ),
  ]);

  assert.match(schema, /organizationId:\s*integer\("organization_id"\)/);
  assert.match(schema, /contentHash:\s*varchar\("content_hash"/);
  assert.match(schema, /archivedAt:\s*timestamp\("archived_at"/);
  assert.match(schema, /organization_logo_assets_org_hash_unique/);
  assert.match(schema, /table\.organizationId[\s\S]*table\.contentHash/);
  assert.match(schema, /organization_logo_assets_byte_size_positive/);

  assert.match(migration, /"public"\."organization_logo_assets"/);
  assert.match(
    migration,
    /UNIQUE INDEX IF NOT EXISTS "organization_logo_assets_org_hash_unique"/
  );
  assert.match(migration, /CHECK \("byte_size" > 0\)/);
});

test("Organization logo repository stays scoped by Organization and archives instead of deleting", async () => {
  const source = await readFile(
    "src/lib/organization-logo-library/drizzle-repository.ts",
    "utf8"
  );

  assert.match(source, /organizationLogoAssets/);
  assert.match(source, /organizationId/);
  assert.match(source, /contentHash/);
  assert.match(source, /archivedAt/);
  assert.match(source, /isNull\(organizationLogoAssets\.archivedAt\)/);
  assert.match(source, /\.insert\(organizationLogoAssets\)/);
  assert.match(source, /\.update\(organizationLogoAssets\)/);
  assert.doesNotMatch(source, /\.delete\(organizationLogoAssets\)/);
});

test("Organization logo storage is Organization-scoped and content-addressed", async () => {
  const source = await readFile(
    "src/lib/organization-logo-library/local-logo-store.mjs",
    "utf8"
  );

  assert.match(source, /validateCatalogImage/);
  assert.match(source, /createHash\("sha256"\)/);
  assert.match(source, /organizations/);
  assert.match(source, /logos/);
  assert.match(source, /contentHash/);
  assert.doesNotMatch(source, /tenantSlug/);
  assert.doesNotMatch(source, /kind:\s*"shipping"/);
});

test("Organization logo service derives Organization authority from Store Management context", async () => {
  const source = await readFile(
    "src/lib/organization-logo-library/server.ts",
    "utf8"
  );

  assert.match(source, /requireStoreManagementContext/);
  assert.match(source, /store\.organizationId/);
  assert.match(source, /saveOrganizationLogo/);
  assert.match(source, /findByHash/);
  assert.match(source, /unarchive/);
  assert.match(source, /create\(/);

  assert.doesNotMatch(
    source,
    /formData\.get\(["']organizationId["']\)/
  );
  assert.doesNotMatch(source, /tenantSlug|schemaName/);
});

test("Organization logos have a dedicated public route outside tenant media routing", async () => {
  const source = await readFile(
    "src/app/organization-logos/[assetId]/[filename]/route.ts",
    "utf8"
  );

  assert.match(source, /readOrganizationLogo/);
  assert.match(source, /contentHash/);
  assert.match(source, /organizationId/);
  assert.match(source, /Cache-Control/);
  assert.doesNotMatch(source, /getTenant\(/);
  assert.doesNotMatch(source, /tenantSlug|schemaName/);
});

test("shipping forms reuse ManagedImageUpload as the Organization logo picker", async () => {
  const [upload, form, createPage, editPage] = await Promise.all([
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/_components/ManagedImageUpload.tsx",
      "utf8"
    ),
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/shipping/_components/ShippingMethodForm.tsx",
      "utf8"
    ),
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/shipping/new/page.tsx",
      "utf8"
    ),
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/shipping/[methodId]/edit/page.tsx",
      "utf8"
    ),
  ]);

  assert.match(createPage, /listOrganizationLogosForStore/);
  assert.match(editPage, /listOrganizationLogosForStore/);

  assert.match(form, /logoAssets/);
  assert.match(form, /ManagedImageUpload/);

  assert.match(upload, /logoAssets/);
  assert.match(upload, /logoAssetId/);
  assert.match(upload, /chooseExistingLogo/);
  assert.match(upload, /uploadNewLogo/);
  assert.doesNotMatch(upload, /organizationId/);
});

test("shipping actions resolve selected logoAssetId through the authorized Organization library", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/_actions/shipping.ts",
    "utf8"
  );

  assert.match(source, /logoAssetId/);
  assert.match(source, /getOrganizationLogoForStore/);
  assert.match(source, /organizationLogoPublicUrl/);
  assert.doesNotMatch(
    source,
    /formData\.get\(["'](?:logoUrl|imageUrl|organizationId)["']\)/
  );
});
