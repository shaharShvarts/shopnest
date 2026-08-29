import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import {
  CATALOG_MEDIA_KINDS,
  createTenantMediaUrl,
  isSafeMediaFilename,
  parseTenantMediaUrl,
} from "../images/image-url.mjs";
import { resolveConfiguredTenant } from "../tenant-validation.mjs";

const mediaKinds = new Set(CATALOG_MEDIA_KINDS);
const contentTypeExtensions = Object.freeze({
  "image/avif": "avif",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});
const extensionContentTypes = new Map(
  Object.entries(contentTypeExtensions).map(([contentType, extension]) => [
    extension,
    contentType,
  ])
);
extensionContentTypes.set("jpeg", "image/jpeg");

export class LocalMediaError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LocalMediaError";
    this.code = code;
  }
}

export function getUploadsRoot(override) {
  const configured = override ?? process.env.SHOPNEST_UPLOADS_DIR;
  return path.resolve(configured?.trim() || path.join(process.cwd(), "uploads"));
}

export function tenantMediaFilePath({ tenantSlug, kind, filename, uploadsRoot }) {
  const tenant = resolveConfiguredTenant(tenantSlug);
  if (!tenant) throw new LocalMediaError("INVALID_TENANT", "Unknown tenant");
  if (!mediaKinds.has(kind)) {
    throw new LocalMediaError("INVALID_KIND", "Unsupported media kind");
  }
  if (!isSafeMediaFilename(filename)) {
    throw new LocalMediaError("INVALID_FILENAME", "Invalid media filename");
  }

  const root = getUploadsRoot(uploadsRoot);
  const filePath = path.resolve(root, tenant.slug, kind, filename);
  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new LocalMediaError("INVALID_FILENAME", "Media path escapes upload root");
  }
  return filePath;
}

export async function saveCatalogImage({ tenantSlug, kind, file, uploadsRoot }) {
  const extension = contentTypeExtensions[file?.type];
  if (!extension || typeof file.arrayBuffer !== "function") {
    throw new LocalMediaError("UNSUPPORTED_TYPE", "Unsupported image content type");
  }

  const filename = `${crypto.randomUUID()}.${extension}`;
  const filePath = tenantMediaFilePath({
    tenantSlug,
    kind,
    filename,
    uploadsRoot,
  });
  const imageUrl = createTenantMediaUrl(tenantSlug, kind, filename);
  if (!imageUrl) throw new LocalMediaError("INVALID_TENANT", "Unknown tenant");

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, Buffer.from(await file.arrayBuffer()));
  return { filename, filePath, imageUrl };
}

export async function readCatalogImage({
  tenantSlug,
  kind,
  filename,
  uploadsRoot,
}) {
  const filePath = tenantMediaFilePath({
    tenantSlug,
    kind,
    filename,
    uploadsRoot,
  });
  const extension = path.extname(filename).slice(1).toLowerCase();
  const contentType = extensionContentTypes.get(extension);
  if (!contentType) {
    throw new LocalMediaError("UNSUPPORTED_TYPE", "Unsupported image extension");
  }

  try {
    return { bytes: await fs.readFile(filePath), contentType, filePath };
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new LocalMediaError("NOT_FOUND", "Media file not found");
    }
    throw error;
  }
}

export async function deleteCatalogImage({
  tenantSlug,
  imageUrl,
  uploadsRoot,
}) {
  const media = parseTenantMediaUrl(imageUrl, tenantSlug);
  if (!media) return false;
  const filePath = tenantMediaFilePath({ ...media, uploadsRoot });

  try {
    await fs.unlink(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}
