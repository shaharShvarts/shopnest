import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  hasStoreManagementPermission,
  requireStoreManagementAccess,
  type StoreManagementPrincipal,
  type StoreManagementRecord,
  type StoreManagementRepository,
} from "../src/lib/store-management/core.ts";

const store: StoreManagementRecord = {
  store: {
    id: 4,
    organizationId: 1,
    displayName: "sex shop",
    slug: "sex-shop",
    status: "provisioned",
    tenantId: 2,
    deletedAt: null,
  },
  tenant: {
    id: 2,
    slug: "sex-shop",
    schemaName: "tenant_4",
    displayName: "sex shop",
    status: "active",
  },
};

const owner: StoreManagementPrincipal = {
  kind: "merchant",
  merchantId: 10,
  email: "owner@example.com",
};

const manager: StoreManagementPrincipal = {
  kind: "manager",
  adminUserId: 20,
  email: "manager@example.com",
  role: "tenant_admin",
  isActive: true,
  legacyTenantSlugs: [],
};

test("Owner and Manager both receive catalog.manage for an authorized Store", async () => {
  const repository = new FakeRepository();
  repository.owned.set("10:4", store);
  repository.managed.set("20:4", store);

  const ownerContext = await requireStoreManagementAccess(
    repository,
    owner,
    4,
    "catalog.manage"
  );
  const managerContext = await requireStoreManagementAccess(
    repository,
    manager,
    4,
    "catalog.manage"
  );

  assert.equal(hasStoreManagementPermission(ownerContext, "catalog.manage"), true);
  assert.equal(hasStoreManagementPermission(managerContext, "catalog.manage"), true);
});

test("Unified catalog routes derive DB authority from Store Management Context", async () => {
  const [actions, products, categories, subcategories] = await Promise.all([
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/_actions/catalog.ts",
      "utf8"
    ),
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/products/page.tsx",
      "utf8"
    ),
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/categories/page.tsx",
      "utf8"
    ),
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/subcategories/page.tsx",
      "utf8"
    ),
  ]);

  const catalogBoundary =
    /requireStoreManagementDb\(\s*storeId,\s*"catalog\.manage"\s*\)/;
  assert.match(actions, catalogBoundary);
  assert.match(products, catalogBoundary);
  assert.match(categories, catalogBoundary);
  assert.match(subcategories, catalogBoundary);

  for (const source of [actions, products, categories, subcategories]) {
    assert.doesNotMatch(
      source,
      /requireTenantAdminDb|getTenant\(|TENANT_SCHEMA_HEADER|schemaName.*formData|tenantSlug.*formData/
    );
  }
});

test("Unified catalog media accepts only the trusted Store tenant", async () => {
  const actions = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/_actions/catalog.ts",
    "utf8"
  );

  assert.match(actions, /function trustedMediaResolver/);
  assert.match(
    actions,
    /typeof value === "string" && value === tenant\.slug \? tenant : null/
  );

  const mediaCalls = [
    ...actions.matchAll(
      /(?:saveCatalogImage|deleteCatalogImage)\(\{[\s\S]*?\n\s*\}\)/g
    ),
  ];

  assert.ok(mediaCalls.length > 0);
  for (const call of mediaCalls) {
    assert.match(
      call[0],
      /resolveTenant/,
      `media call did not use the trusted Store tenant resolver: ${call[0]}`
    );
  }

  assert.doesNotMatch(actions, /resolveConfiguredTenant/);
});

test("Unified catalog actions expose create, edit, and delete for all catalog entities", async () => {
  const actions = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/_actions/catalog.ts",
    "utf8"
  );

  for (const name of [
    "addManagedCategory",
    "editManagedCategory",
    "deleteManagedCategory",
    "addManagedSubcategory",
    "editManagedSubcategory",
    "deleteManagedSubcategory",
    "addManagedProduct",
    "editManagedProduct",
    "deleteManagedProduct",
  ]) {
    assert.match(actions, new RegExp(`export async function ${name}`));
  }

  assert.match(actions, /saveCatalogImage/);
  assert.match(actions, /deleteCatalogImage/);
  assert.match(actions, /adjustInventoryInTransaction/);
  assert.match(actions, /initializeInventoryAlertsInTransaction/);
});

test("Dashboard catalog navigation stays Store-specific", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/_components/CatalogNavigation.tsx",
    "utf8"
  );

  assert.match(source, /\/dashboard\/stores\/\$\{storeId\}\/products/);
  assert.match(source, /\/dashboard\/stores\/\$\{storeId\}\/categories/);
  assert.match(source, /\/dashboard\/stores\/\$\{storeId\}\/subcategories/);
  assert.doesNotMatch(source, /\[tenant\]|tenantSlug|schemaName/);
});

class FakeRepository implements StoreManagementRepository {
  owned = new Map<string, StoreManagementRecord>();
  managed = new Map<string, StoreManagementRecord>();

  async findOwnedStore(merchantId: number, storeId: number) {
    return this.owned.get(`${merchantId}:${storeId}`) ?? null;
  }

  async findManagedStore(adminUserId: number, storeId: number) {
    return this.managed.get(`${adminUserId}:${storeId}`) ?? null;
  }

  async listManagedStores(adminUserId: number) {
    return [...this.managed.entries()]
      .filter(([key]) => key.startsWith(`${adminUserId}:`))
      .map(([, value]) => value);
  }
}


test("Catalog navigation is localized and ordered categories, subcategories, products", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/_components/CatalogNavigation.tsx",
    "utf8"
  );

  const categoriesIndex = source.indexOf('label: t("categories")');
  const subcategoriesIndex = source.indexOf('label: t("subcategories")');
  const productsIndex = source.indexOf('label: t("products")');

  assert.ok(categoriesIndex >= 0);
  assert.ok(subcategoriesIndex > categoriesIndex);
  assert.ok(productsIndex > subcategoriesIndex);
  assert.match(source, /useTranslations\("StoreCatalogManagement"\)/);
});

test("Unified catalog UI has Hebrew and English translations and dashboard language switching", async () => {
  const [english, hebrew, layout, switcher, actions] = await Promise.all([
    readFile("src/messages/en.json", "utf8").then(JSON.parse),
    readFile("src/messages/he.json", "utf8").then(JSON.parse),
    readFile("src/app/(merchant)/dashboard/layout.tsx", "utf8"),
    readFile(
      "src/app/(merchant)/dashboard/_components/DashboardLanguageSwitcher.tsx",
      "utf8"
    ),
    readFile("src/app/(merchant)/dashboard/_actions.ts", "utf8"),
  ]);

  assert.equal(english.StoreCatalogManagement.categories, "Categories");
  assert.equal(hebrew.StoreCatalogManagement.categories, "קטגוריות");
  assert.equal(hebrew.StoreCatalogManagement.subcategories, "תתי־קטגוריות");
  assert.equal(hebrew.StoreCatalogManagement.products, "מוצרים");
  assert.match(layout, /DashboardLanguageSwitcher/);
  assert.match(switcher, /setDashboardLocaleAction/);
  assert.match(actions, /SHOPNEST_LOCALE/);
  assert.match(actions, /locale !== "he" && locale !== "en"/);
});


test("Managed product form uses shared management controls and 44px actions", async () => {
  const source = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/_components/ManagedProductForm.tsx",
    "utf8"
  );

  assert.match(source, /ManagementInput/);
  assert.match(source, /ManagementSelect/);
  assert.match(source, /ManagementTextarea/);
  assert.match(source, /size="management"/);
  assert.doesNotMatch(source, /<select\\b/);
  assert.doesNotMatch(source, /<textarea\\b/);
  assert.doesNotMatch(source, /min-h-12/);
});

test("Managed category and subcategory forms use shared management controls", async () => {
  const [categoryForm, subcategoryForm] = await Promise.all([
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/_components/ManagedCategoryForm.tsx",
      "utf8"
    ),
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/_components/ManagedSubcategoryForm.tsx",
      "utf8"
    ),
  ]);

  assert.match(categoryForm, /ManagementInput/);
  assert.match(categoryForm, /size="management"/);
  assert.doesNotMatch(categoryForm, /<input\\b/);
  assert.doesNotMatch(categoryForm, /min-h-12/);

  assert.match(subcategoryForm, /ManagementInput/);
  assert.match(subcategoryForm, /ManagementSelect/);
  assert.match(subcategoryForm, /size="management"/);
  assert.doesNotMatch(subcategoryForm, /<select\\b/);
  assert.doesNotMatch(subcategoryForm, /min-h-12/);
});

test("Managed catalog edit keeps the existing image unless a replacement is selected", async () => {
  const [actions, upload, categoryForm, editPage] = await Promise.all([
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/_actions/catalog.ts",
      "utf8"
    ),
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/_components/ManagedImageUpload.tsx",
      "utf8"
    ),
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/_components/ManagedCategoryForm.tsx",
      "utf8"
    ),
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/categories/[categoryId]/edit/page.tsx",
      "utf8"
    ),
  ]);

  assert.match(
    actions,
    /value instanceof File && value\.size === 0 \? undefined : value/
  );
  assert.match(upload, /resolveTenantImageUrl/);
  assert.match(upload, /URL\.createObjectURL/);
  assert.match(upload, /URL\.revokeObjectURL/);
  assert.match(upload, /required=\{!existingImageUrl\}/);
  assert.match(upload, /initialImage/);
  assert.match(categoryForm, /ManagedImageUpload/);
  assert.match(categoryForm, /initialImage=\{category\?\.imageUrl\}/);
  assert.match(editPage, /max-w-6xl/);
  assert.match(editPage, /tenantSlug=\{tenant\.slug\}/);
});


test("Catalog media route reads through trusted request tenant", async () => {
  const route = await readFile(
    "src/app/media/[kind]/[filename]/route.ts",
    "utf8"
  );

  assert.match(route, /const tenant = await getTenant\(\)/);
  assert.match(
    route,
    /typeof value === "string" && value === tenant\.slug \? tenant : null/
  );
  assert.match(route, /readCatalogImage\(\{[\s\S]*resolveTenant/);
});


test("Local selected catalog image uses blob preview without Next Image", async () => {
  const upload = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/_components/ManagedImageUpload.tsx",
    "utf8"
  );

  assert.match(upload, /URL\.createObjectURL/);
  assert.match(upload, /<img/);
  assert.doesNotMatch(upload, /from "next\/image"/);
});


test("Managed products persist one-to-many image galleries", async () => {
  const [schema, imageSchema, productImageSchema, actions, form, editPage] =
    await Promise.all([
      readFile("src/drizzle/schema.ts", "utf8"),
      readFile("src/drizzle/schema/image.ts", "utf8"),
      readFile("src/drizzle/schema/productImage.ts", "utf8"),
      readFile(
        "src/app/(merchant)/dashboard/stores/[id]/_actions/catalog.ts",
        "utf8"
      ),
      readFile(
        "src/app/(merchant)/dashboard/stores/[id]/_components/ManagedProductForm.tsx",
        "utf8"
      ),
      readFile(
        "src/app/(merchant)/dashboard/stores/[id]/products/[productId]/edit/page.tsx",
        "utf8"
      ),
    ]);

  assert.match(schema, /schema\/image/);
  assert.match(schema, /schema\/productImage/);
  assert.match(imageSchema, /imageUrl: text\("image_url"\)/);
  assert.match(productImageSchema, /sortOrder: integer\("sort_order"\)/);
  assert.match(productImageSchema, /product_images_product_sort_unique/);
  assert.match(actions, /formData\s*\.getAll\("images"\)/);
  assert.match(actions, /z\.array\(imageSchema\)\.min\(1/);
  assert.match(actions, /insert\(productImages\)/);
  assert.match(actions, /imageUrl: uploaded\[0\]\.imageUrl/);
  assert.match(form, /ManagedProductImages/);
  assert.match(editPage, /existingImages=\{imageRows\}/);
});

test("Managed product gallery supports click selection and drag-drop", async () => {
  const gallery = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/_components/ManagedProductImages.tsx",
    "utf8"
  );

  assert.match(gallery, /multiple/);
  assert.match(gallery, /onDragOver=/);
  assert.match(gallery, /onDrop=/);
  assert.match(gallery, /event\.dataTransfer\.files/);
  assert.match(gallery, /dropEffect = "copy"/);
  assert.match(gallery, /addFiles\(/);
});

test("Storefront product details render a carousel for gallery images", async () => {
  const [page, details] = await Promise.all([
    readFile(
      "src/app/[tenant]/(storefront)/products/[id]/details/page.tsx",
      "utf8"
    ),
    readFile(
      "src/app/[tenant]/(storefront)/products/_components/ProductDetails.tsx",
      "utf8"
    ),
  ]);

  assert.match(page, /from\(productImages\)/);
  assert.match(page, /imageUrls:/);
  assert.match(details, /normalizedImageUrls\.length > 1/);
  assert.match(details, /activeImageIndex/);
  assert.match(details, /previousImage/);
  assert.match(details, /nextImage/);
});


test("Storefront cards resolve media from the active tenant context", async () => {
  const [categoryCard, subcategoryCard, productCard] = await Promise.all([
    readFile("src/app/components/CategoryCard.tsx", "utf8"),
    readFile("src/app/components/SubcategoryCard.tsx", "utf8"),
    readFile("src/app/components/ProductCard.tsx", "utf8"),
  ]);

  for (const source of [categoryCard, subcategoryCard]) {
    assert.match(source, /resolveTenantImageUrl\(/);
    assert.match(source, /value === tenant\.slug/);
    assert.match(source, /basePath: tenant\.basePath/);
  }

  assert.match(productCard, /resolveTenantImageUrl\(/);
  assert.match(productCard, /tenantSlug && value === tenantSlug/);
  assert.match(productCard, /basePath: `\/\${tenantSlug}`/);
});


test("Cart product images resolve for dynamic tenants", async () => {
  const cart = await readFile(
    "src/app/[tenant]/(storefront)/components/CartTable.tsx",
    "utf8"
  );

  assert.match(cart, /resolveTenantImageUrl\(/);
  assert.match(cart, /tenantSlug && value === tenantSlug/);
  assert.match(cart, /basePath: `\/\${tenantSlug}`/);
});

test("Storefront carousel keeps a stable image frame", async () => {
  const details = await readFile(
    "src/app/[tenant]/(storefront)/products/_components/ProductDetails.tsx",
    "utf8"
  );

  assert.match(details, /aspect-square/);
  assert.match(details, /fill/);
  assert.match(details, /object-contain p-3 sm:p-6/);
  assert.doesNotMatch(details, /h-auto max-h-\[72vh\]/);
});


test("Catalog lists and gallery use shared management actions", async () => {
  const [categoriesPage, productsPage, subcategoriesPage, gallery] =
    await Promise.all([
      readFile(
        "src/app/(merchant)/dashboard/stores/[id]/categories/page.tsx",
        "utf8"
      ),
      readFile(
        "src/app/(merchant)/dashboard/stores/[id]/products/page.tsx",
        "utf8"
      ),
      readFile(
        "src/app/(merchant)/dashboard/stores/[id]/subcategories/page.tsx",
        "utf8"
      ),
      readFile(
        "src/app/(merchant)/dashboard/stores/[id]/_components/ManagedProductImages.tsx",
        "utf8"
      ),
    ]);

  for (const source of [categoriesPage, productsPage, subcategoriesPage]) {
    assert.match(source, /size="management"/);
    assert.doesNotMatch(source, /<button\\b/);
  }

  assert.match(gallery, /<Button/);
  assert.match(gallery, /size="management"/);
  assert.doesNotMatch(gallery, /size-8 items-center justify-center/);
});

test("Managed product creation enforces products_limit server-side with concurrency protection", async () => {
  const actions = await readFile(
    "src/app/(merchant)/dashboard/stores/[id]/_actions/catalog.ts",
    "utf8"
  );

  assert.match(actions, /getEffectiveStoreEntitlements\(storeId\)/);
  assert.match(actions, /integerEntitlement\([\s\S]*"products_limit"/);
  assert.match(actions, /entitlementHasCapacity/);
  assert.match(actions, /pg_advisory_xact_lock/);
  assert.match(actions, /shopnest:store-products:/);
  assert.match(actions, /ProductLimitReachedError/);
  assert.match(actions, /isNull\(products\.deletedAt\)/);
});

test("Managed products UI exposes quota and blocks create navigation at capacity", async () => {
  const [productsPage, newPage, form, english, hebrew] = await Promise.all([
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/products/page.tsx",
      "utf8"
    ),
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/products/new/page.tsx",
      "utf8"
    ),
    readFile(
      "src/app/(merchant)/dashboard/stores/[id]/_components/ManagedProductForm.tsx",
      "utf8"
    ),
    readFile("src/messages/en.json", "utf8").then(JSON.parse),
    readFile("src/messages/he.json", "utf8").then(JSON.parse),
  ]);

  assert.match(productsPage, /productQuota/);
  assert.match(productsPage, /canAddProduct/);
  assert.match(productsPage, /aria-disabled="true"/);
  assert.match(newPage, /productQuotaReachedTitle/);
  assert.match(newPage, /entitlementHasCapacity/);
  assert.match(form, /state\.errors\?\._form/);
  assert.ok(english.StoreCatalogManagement.productQuotaReached);
  assert.ok(hebrew.StoreCatalogManagement.productQuotaReached);
});
