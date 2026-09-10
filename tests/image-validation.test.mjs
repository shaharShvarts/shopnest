import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { MAX_IMAGE_UPLOAD_BYTES } from "../src/lib/images/upload-limits.mjs";
import { saveCatalogImage, readCatalogImage } from "../src/lib/media/local-media-store.mjs";

const image = () => sharp({ create: { width: 12, height: 9, channels: 4, background: "#3478aacc" } });
const file = (bytes, name = "upload.jpg", type = "image/jpeg") => new File([new Uint8Array(bytes)], name, { type });
async function withRoot(run) {
  const uploadsRoot = await mkdtemp(path.join(tmpdir(), "shopnest-image-validation-"));
  const save = (file) => saveCatalogImage({ tenantSlug: "gift-shop", kind: "products", file, uploadsRoot });
  try { await run(save, uploadsRoot); }
  finally { await rm(uploadsRoot, { recursive: true, force: true }); }
}

for (const format of ["jpeg", "png", "webp", "gif", "tiff", "avif"]) {
  test(`accepts real ${format} pixels regardless of filename and MIME`, async () => {
    const bytes = await image().toFormat(format).toBuffer();
    await withRoot(async (save, uploadsRoot) => {
      const result = await save(file(bytes, "not-an-image.txt", "application/octet-stream"));
      assert.match(result.filename, /^[a-f0-9-]+\.png$/);
      const stored = await readCatalogImage({ tenantSlug: "gift-shop", kind: "products", filename: result.filename, uploadsRoot });
      assert.equal(stored.contentType, "image/png");
      const meta = await sharp(stored.bytes).metadata();
      assert.equal(meta.format, "png");
      assert.equal(meta.width, 12);
      assert.equal(meta.height, 9);
      await sharp(stored.bytes).stats();
    });
  });
}

test("accepts decodable SVG and stores raster pixels rather than executable markup", async () => {
  await withRoot(async (save, uploadsRoot) => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="9"><script>alert(1)</script><rect width="12" height="9" fill="red"/></svg>');
    const result = await save(file(svg, "drawing.svg", "image/svg+xml"));
    const stored = await readCatalogImage({ tenantSlug: "gift-shop", kind: "products", filename: result.filename, uploadsRoot });
    assert.equal((await sharp(stored.bytes).metadata()).format, "png");
    assert.equal(stored.bytes.includes(Buffer.from("<script")), false);
  });
});

for (const [name, bytes, filename, mime] of [
  ["fake jpg containing text", Buffer.from("this is not an image"), "fake.jpg", "text/plain"],
  ["spoofed image MIME", Buffer.from("<html>not pixels</html>"), "spoof.png", "image/png"],
  ["unsupported BMP", Buffer.from("424d3a0000000000000036000000280000000100000001000000010018000000000004000000000000000000000000000000000000000000ff00", "hex"), "image.bmp", "image/bmp"],
]) {
  test(`rejects ${name} before writing anything`, async () => {
    await withRoot(async (save, root) => {
      await assert.rejects(save(file(bytes, filename, mime)), { code: "INVALID_IMAGE" });
      assert.deepEqual(await readdir(root), []);
    });
  });
}

test("rejects truncated JPEG even when metadata is readable", async () => {
  const jpeg = await sharp(randomBytes(120 * 90 * 3), { raw: { width: 120, height: 90, channels: 3 } }).jpeg().toBuffer();
  const truncated = jpeg.subarray(0, jpeg.length - 12);
  assert.equal((await sharp(truncated).metadata()).format, "jpeg");
  await withRoot(async (save, root) => {
    await assert.rejects(save(file(truncated)), { code: "INVALID_IMAGE" });
    assert.deepEqual(await readdir(root), []);
  });
});

test("rejects corrupt PNG pixel data", async () => {
  const png = await image().png().toBuffer();
  const corrupt = Buffer.from(png);
  const idat = corrupt.indexOf(Buffer.from("IDAT"));
  corrupt[idat + 8] ^= 255;
  await withRoot(async (save) => {
    await assert.rejects(save(file(corrupt, "corrupt.png", "image/png")), { code: "INVALID_IMAGE" });
  });
});

test("enforces 5 MiB on oversized valid images and actual bytes with a false size", async () => {
  const bytes = await sharp(randomBytes(1500 * 1500 * 3), { raw: { width: 1500, height: 1500, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
  assert.ok(bytes.length > MAX_IMAGE_UPLOAD_BYTES);
  await sharp(bytes).stats(); // The oversized fixture itself is a decodable image.
  await withRoot(async (save, root) => {
    await assert.rejects(save(file(bytes, "large.png", "image/png")), { code: "INVALID_SIZE" });
    await assert.rejects(save({ size: 1, type: "image/png", arrayBuffer: async () => bytes }), { code: "INVALID_SIZE" });
    assert.deepEqual(await readdir(root), []);
  });
});

test("accepts a valid image at exactly the maximum upload byte size", async () => {
  const png = await image().png().toBuffer();
  const padded = Buffer.concat([png, Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES - png.length)]);
  await withRoot(async (save) => {
    await save(file(padded, "boundary.png", "image/png"));
  });
});

test("validates all animation frames and uses the first frame for the catalog", async () => {
  const frames = randomBytes(12 * 18 * 3);
  const gif = await sharp(frames, { raw: { width: 12, height: 18, channels: 3, pageHeight: 9 } })
    .gif({ delay: [100, 100], loop: 0 }).toBuffer();
  assert.equal((await sharp(gif, { animated: true }).metadata()).pages, 2);
  await withRoot(async (save, uploadsRoot) => {
    const result = await save(file(gif, "animated.gif", "image/gif"));
    const stored = await readCatalogImage({ tenantSlug: "gift-shop", kind: "products", filename: result.filename, uploadsRoot });
    assert.equal((await sharp(stored.bytes).metadata()).height, 9);
    await assert.rejects(save(file(gif.subarray(0, gif.length - 6), "corrupt.gif", "image/gif")), { code: "INVALID_IMAGE" });
  });
});
