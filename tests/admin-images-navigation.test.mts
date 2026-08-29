import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  isLocalPublicImageUrl,
  normalizeImageUrl,
} from "../src/lib/images/image-url.mjs";

test("relative stored image paths become origin-relative URLs", () => {
  const editPage = "https://shopnest.test/gift-shop/admin/categories/2/edit";
  assert.equal(
    new URL("categories/example.jpg", editPage).pathname,
    "/gift-shop/admin/categories/2/categories/example.jpg"
  );

  const normalized = normalizeImageUrl("categories/example.jpg");
  assert.equal(normalized, "/categories/example.jpg");
  assert.equal(new URL(normalized!, editPage).pathname, "/categories/example.jpg");
});

test("public, Windows, and legacy tenant-prefixed paths normalize safely", () => {
  assert.equal(
    normalizeImageUrl("public/categories/example.jpg"),
    "/categories/example.jpg"
  );
  assert.equal(
    normalizeImageUrl("public\\subcategories\\example.jpg"),
    "/subcategories/example.jpg"
  );
  assert.equal(
    normalizeImageUrl("/gift-shop/products/example.jpg"),
    "/products/example.jpg"
  );
});

test("portable external and browser preview URLs remain unchanged", () => {
  assert.equal(
    normalizeImageUrl("https://cdn.example.com/catalog/example.jpg"),
    "https://cdn.example.com/catalog/example.jpg"
  );
  assert.equal(normalizeImageUrl("blob:https://shopnest.test/id"), "blob:https://shopnest.test/id");
  assert.equal(isLocalPublicImageUrl("/products/example.jpg"), true);
  assert.equal(
    isLocalPublicImageUrl("https://cdn.example.com/example.jpg"),
    false
  );
  assert.equal(normalizeImageUrl("../private/example.jpg"), null);
  assert.equal(normalizeImageUrl("/%2e%2e/private/example.jpg"), null);
  assert.equal(normalizeImageUrl("C:\\private\\example.jpg"), null);
  assert.equal(normalizeImageUrl("javascript:alert(1)"), null);
});

test("admin image preview supports stored, replacement, and missing states", async () => {
  const [upload, preview] = await Promise.all([
    readFile("src/app/admin/_components/ImageUpload.tsx", "utf8"),
    readFile("src/app/admin/_components/AdminImagePreview.tsx", "utf8"),
  ]);

  assert.match(upload, /normalizeImageUrl\(initialImage\)/);
  assert.match(upload, /URL\.createObjectURL\(image\)/);
  assert.match(upload, /URL\.revokeObjectURL\(objectUrl\)/);
  assert.match(upload, /required=\{!existingImageUrl\}/);
  assert.match(preview, /Stored image unavailable/);
  assert.match(preview, /unoptimized/);
  assert.doesNotMatch(upload + preview, /localhost/);
});

test("old image deletion occurs only after a successful database update", async () => {
  for (const entity of ["categories", "subcategories", "products"]) {
    const source = await readFile(
      `src/app/admin/_actions/${entity}.ts`,
      "utf8"
    );
    const update = source.indexOf(`.update(${entity})`);
    const oldImageDelete = source.indexOf("fs.unlink(oldImagePath)");
    assert.ok(update >= 0, `${entity} update was not found`);
    assert.ok(
      oldImageDelete > update,
      `${entity} deletes the old image before its database update`
    );
  }
});

test("admin create and edit pages use deterministic tenant-aware Back links", async () => {
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
    assert.doesNotMatch(source, /router\.back|panda-pop|gift-shop|dvorik-collection/);
  }
});
