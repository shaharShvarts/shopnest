import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  normalizeImageUrl,
  parseTenantMediaUrl,
  resolveTenantImageUrl,
} from "../src/lib/images/image-url.mjs";
import {
  deleteCatalogImage,
  LocalMediaError,
  readCatalogImage,
  saveCatalogImage,
  tenantMediaFilePath,
} from "../src/lib/media/local-media-store.mjs";

type TestFile = {
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
};

function imageFile(contents: string, type = "image/jpeg"): TestFile {
  const bytes = Buffer.from(contents);
  return {
    type,
    arrayBuffer: async () => bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ) as ArrayBuffer,
  };
}

async function withUploadsRoot(
  run: (uploadsRoot: string) => Promise<void>
) {
  const uploadsRoot = await mkdtemp(path.join(tmpdir(), "shopnest-media-"));
  try {
    await run(uploadsRoot);
  } finally {
    await rm(uploadsRoot, { recursive: true, force: true });
  }
}

test("a runtime image is readable immediately after upload without a rebuild", async () => {
  await withUploadsRoot(async (uploadsRoot) => {
    const uploaded = await saveCatalogImage({
      tenantSlug: "gift-shop",
      kind: "categories",
      file: imageFile("category-image"),
      uploadsRoot,
    });
    assert.match(
      uploaded.imageUrl,
      /^\/gift-shop\/media\/categories\/[a-f0-9-]+\.jpg$/
    );

    const media = parseTenantMediaUrl(uploaded.imageUrl, "gift-shop");
    assert.ok(media);
    const response = await readCatalogImage({ ...media, uploadsRoot });
    assert.equal(response.contentType, "image/jpeg");
    assert.equal(response.bytes.toString(), "category-image");
  });
});

test("gift-shop and panda-pop use separate physical namespaces", async () => {
  await withUploadsRoot(async (uploadsRoot) => {
    const gift = await saveCatalogImage({
      tenantSlug: "gift-shop",
      kind: "products",
      file: imageFile("gift"),
      uploadsRoot,
    });
    const panda = await saveCatalogImage({
      tenantSlug: "panda-pop",
      kind: "products",
      file: imageFile("panda"),
      uploadsRoot,
    });

    assert.notEqual(path.dirname(gift.filePath), path.dirname(panda.filePath));
    assert.match(gift.filePath, /gift-shop[\\/]products/);
    assert.match(panda.filePath, /panda-pop[\\/]products/);
    assert.equal(
      resolveTenantImageUrl(gift.imageUrl, "panda-pop"),
      null
    );
    assert.equal(parseTenantMediaUrl(gift.imageUrl, "panda-pop"), null);
    assert.equal(
      await deleteCatalogImage({
        tenantSlug: "panda-pop",
        imageUrl: gift.imageUrl,
        uploadsRoot,
      }),
      false
    );
    assert.equal((await readFile(gift.filePath)).toString(), "gift");
  });
});

test("media paths reject traversal, arbitrary directories, and unknown tenants", () => {
  const base = {
    tenantSlug: "gift-shop",
    kind: "categories" as const,
    uploadsRoot: path.join(tmpdir(), "shopnest-media-security"),
  };
  for (const filename of [
    "../secret.jpg",
    "%2e%2e.jpg",
    "%252e%252e.jpg",
    "C:\\secret.jpg",
    "folder/secret.jpg",
  ]) {
    assert.throws(
      () => tenantMediaFilePath({ ...base, filename }),
      LocalMediaError
    );
  }
  assert.throws(
    () =>
      tenantMediaFilePath({
        ...base,
        kind: "private" as never,
        filename: "image.jpg",
      }),
    LocalMediaError
  );
  assert.throws(
    () =>
      tenantMediaFilePath({
        ...base,
        tenantSlug: "random-store",
        filename: "image.jpg",
      }),
    LocalMediaError
  );
  assert.equal(normalizeImageUrl("/%252e%252e/private/image.jpg"), null);
  assert.equal(normalizeImageUrl("C:\\private\\image.jpg"), null);
});

test("legacy image values resolve safely inside only the current tenant", () => {
  assert.equal(
    resolveTenantImageUrl("/categories/file.jpg", "gift-shop"),
    "/gift-shop/media/categories/file.jpg"
  );
  assert.equal(
    resolveTenantImageUrl("categories/file.jpg", "gift-shop"),
    "/gift-shop/media/categories/file.jpg"
  );
  assert.equal(
    resolveTenantImageUrl("public\\subcategories\\file.jpg", "panda-pop"),
    "/panda-pop/media/subcategories/file.jpg"
  );
  assert.equal(
    resolveTenantImageUrl("/gift-shop/products/file.jpg", "gift-shop"),
    "/gift-shop/media/products/file.jpg"
  );
  assert.equal(
    resolveTenantImageUrl("/gift-shop/products/file.jpg", "panda-pop"),
    null
  );
  assert.equal(
    resolveTenantImageUrl(
      "https://cdn.example.com/gift-shop/products/file.jpg",
      "gift-shop"
    ),
    "https://cdn.example.com/gift-shop/products/file.jpg"
  );
});

for (const kind of ["categories", "subcategories", "products"] as const) {
  test(`${kind} image create, edit, and delete lifecycle is safe`, async () => {
    await withUploadsRoot(async (uploadsRoot) => {
      const original = await saveCatalogImage({
        tenantSlug: "gift-shop",
        kind,
        file: imageFile(`${kind}-old`, "image/png"),
        uploadsRoot,
      });
      assert.equal(
        (await readCatalogImage({
          tenantSlug: "gift-shop",
          kind,
          filename: original.filename,
          uploadsRoot,
        })).bytes.toString(),
        `${kind}-old`
      );

      const replacement = await saveCatalogImage({
        tenantSlug: "gift-shop",
        kind,
        file: imageFile(`${kind}-new`, "image/webp"),
        uploadsRoot,
      });
      assert.equal(
        await deleteCatalogImage({
          tenantSlug: "gift-shop",
          imageUrl: original.imageUrl,
          uploadsRoot,
        }),
        true
      );
      await assert.rejects(
        readCatalogImage({
          tenantSlug: "gift-shop",
          kind,
          filename: original.filename,
          uploadsRoot,
        }),
        (error: unknown) =>
          error instanceof LocalMediaError && error.code === "NOT_FOUND"
      );
      assert.equal(
        (await readCatalogImage({
          tenantSlug: "gift-shop",
          kind,
          filename: replacement.filename,
          uploadsRoot,
        })).bytes.toString(),
        `${kind}-new`
      );
      assert.equal(
        await deleteCatalogImage({
          tenantSlug: "gift-shop",
          imageUrl: replacement.imageUrl,
          uploadsRoot,
        }),
        true
      );
      assert.equal(
        await deleteCatalogImage({
          tenantSlug: "gift-shop",
          imageUrl: "https://cdn.example.com/image.jpg",
          uploadsRoot,
        }),
        false
      );
    });
  });
}

test("admin actions use the tenant media abstraction and replace after DB success", async () => {
  const entities = [
    ["categories", "Category", "categories"],
    ["subcategories", "Subcategory", "subcategories"],
    ["products", "Product", "products"],
  ] as const;

  for (const [file, entity, table] of entities) {
    const source = await readFile(`src/app/admin/_actions/${file}.ts`, "utf8");
    assert.match(source, new RegExp(`kind: "${file}"`));
    assert.doesNotMatch(source, /public\/(categories|subcategories|products)/);
    const editStart = source.indexOf(`export async function edit${entity}`);
    const editEnd = source.indexOf("export async function Toggle", editStart);
    const editSource = source.slice(editStart, editEnd);
    const update = editSource.indexOf(`.update(${table})`);
    const oldDelete = editSource.lastIndexOf("deleteCatalogImage");
    assert.ok(update >= 0, `${file} database update was not found`);
    assert.ok(oldDelete > update, `${file} deletes the old image before DB success`);
  }
});

test("runtime route serves typed media and middleware includes dotted media URLs", async () => {
  const [route, middleware] = await Promise.all([
    readFile("src/app/media/[kind]/[filename]/route.ts", "utf8"),
    readFile("src/middleware.ts", "utf8"),
  ]);
  assert.match(route, /dynamic = "force-dynamic"/);
  assert.match(route, /readCatalogImage/);
  assert.match(route, /"Content-Type": image\.contentType/);
  assert.match(route, /"X-Content-Type-Options": "nosniff"/);
  assert.match(middleware, /\/:tenant\/media\/:path\*/);
});

test("admin image preview supports stored, replacement, and missing states", async () => {
  const [upload, preview] = await Promise.all([
    readFile("src/app/admin/_components/ImageUpload.tsx", "utf8"),
    readFile("src/app/admin/_components/AdminImagePreview.tsx", "utf8"),
  ]);

  assert.match(upload, /resolveTenantImageUrl\(initialImage, tenant\.slug\)/);
  assert.match(upload, /URL\.createObjectURL\(image\)/);
  assert.match(upload, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(upload, /required=\{!existingImageUrl\}/);
  assert.match(preview, /Stored image unavailable/);
  assert.match(preview, /unoptimized/);
  assert.doesNotMatch(upload + preview, /localhost/);
});

test("admin create and edit pages retain deterministic tenant-aware Back links", async () => {
  const expected = [
    ["categories/new/page.tsx", "/admin/categories"],
    ["categories/[id]/edit/page.tsx", "/admin/categories"],
    ["subcategories/new/page.tsx", "/admin/subcategories"],
    ["subcategories/[id]/edit/page.tsx", "/admin/subcategories"],
    ["products/new/page.tsx", "/admin/products"],
    ["products/[id]/edit/page.tsx", "/admin/products"],
  ];

  const header = await readFile(
    "src/app/admin/_components/AdminFormHeader.tsx",
    "utf8"
  );
  assert.match(header, /TenantLink/);

  for (const [page, backHref] of expected) {
    const source = await readFile(`src/app/admin/${page}`, "utf8");
    assert.match(source, new RegExp(`backHref=\\"${backHref}\\"`));
    assert.doesNotMatch(
      source,
      /router\.back|panda-pop|gift-shop|dvorik-collection/
    );
  }
});

test("shipping create and edit forms show localized code guidance", async () => {
  const [form, createPage, editPage, english, hebrew] = await Promise.all([
    readFile("src/app/admin/shipping/_components/ShippingMethodForm.tsx", "utf8"),
    readFile("src/app/admin/shipping/new/page.tsx", "utf8"),
    readFile("src/app/admin/shipping/[id]/edit/page.tsx", "utf8"),
    readFile("src/messages/en.json", "utf8").then(JSON.parse),
    readFile("src/messages/he.json", "utf8").then(JSON.parse),
  ]);

  assert.match(createPage, /ShippingMethodForm/);
  assert.match(editPage, /ShippingMethodForm/);
  assert.match(form, /getTranslations\("Shipping"\)/);
  assert.match(form, /aria-describedby="shipping-code-help"/);
  assert.match(form, /text-xs text-muted-foreground/);
  assert.equal(
    english.Shipping.codeHelp,
    "Internal identifier, e.g. home_delivery. Avoid changing it after the method has been used in orders."
  );
  assert.equal(
    hebrew.Shipping.codeHelp,
    "מזהה פנימי, לדוגמה home_delivery. מומלץ לא לשנות אותו לאחר שנעשה בו שימוש בהזמנות."
  );
});
