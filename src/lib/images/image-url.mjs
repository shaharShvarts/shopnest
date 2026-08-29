import {
  CONFIGURED_TENANT_SLUGS,
  resolveConfiguredTenant,
} from "../tenant-validation.mjs";

const BROWSER_IMAGE_URL_PATTERN = /^(?:https?:|data:|blob:)/i;
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;

export const CATALOG_MEDIA_KINDS = Object.freeze([
  "categories",
  "subcategories",
  "products",
]);
export const SUPPORTED_IMAGE_CONTENT_TYPES = Object.freeze([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const catalogMediaKinds = new Set(CATALOG_MEDIA_KINDS);

export function normalizeImageUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || /^[a-z]:[\\/]/i.test(trimmed)) return null;
  if (BROWSER_IMAGE_URL_PATTERN.test(trimmed) || trimmed.startsWith("//")) {
    return trimmed;
  }
  if (URL_SCHEME_PATTERN.test(trimmed)) return null;

  let path = trimmed.replaceAll("\\", "/");
  path = path.replace(/^\.\//, "").replace(/^\/*public\//, "");
  const suffixIndex = path.search(/[?#]/);
  const suffix = suffixIndex === -1 ? "" : path.slice(suffixIndex);
  const pathname = (suffixIndex === -1 ? path : path.slice(0, suffixIndex))
    .replace(/^\/+/, "");
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some(isUnsafePathSegment)) return null;

  if (
    CONFIGURED_TENANT_SLUGS.includes(segments[0]) &&
    catalogMediaKinds.has(segments[1])
  ) {
    segments.splice(1, 0, "media");
  }

  return `/${segments.join("/")}${suffix}`;
}

export function resolveTenantImageUrl(value, tenantSlug) {
  const normalized = normalizeImageUrl(value);
  if (!normalized || isExternalImageUrl(normalized)) return normalized;

  const tenant = resolveConfiguredTenant(tenantSlug);
  if (!tenant) return tenantSlug ? null : normalized;

  const suffixIndex = normalized.search(/[?#]/);
  const suffix = suffixIndex === -1 ? "" : normalized.slice(suffixIndex);
  const pathname = suffixIndex === -1 ? normalized : normalized.slice(0, suffixIndex);
  const segments = pathname.split("/").filter(Boolean);

  if (CONFIGURED_TENANT_SLUGS.includes(segments[0])) {
    if (segments[0] !== tenant.slug) return null;
    if (
      segments.length === 4 &&
      segments[1] === "media" &&
      catalogMediaKinds.has(segments[2])
    ) {
      return `${pathname}${suffix}`;
    }
    return null;
  }

  if (
    segments.length === 3 &&
    segments[0] === "media" &&
    catalogMediaKinds.has(segments[1])
  ) {
    return `${tenant.basePath}${pathname}${suffix}`;
  }

  if (segments.length === 2 && catalogMediaKinds.has(segments[0])) {
    return `${tenant.basePath}/media/${segments.join("/")}${suffix}`;
  }

  return normalized;
}

export function createTenantMediaUrl(tenantSlug, kind, filename) {
  const tenant = resolveConfiguredTenant(tenantSlug);
  if (!tenant || !catalogMediaKinds.has(kind) || !isSafeMediaFilename(filename)) {
    return null;
  }
  return `${tenant.basePath}/media/${kind}/${filename}`;
}

export function parseTenantMediaUrl(value, expectedTenantSlug) {
  const resolved = resolveTenantImageUrl(value, expectedTenantSlug);
  const tenant = resolveConfiguredTenant(expectedTenantSlug);
  if (!resolved || !tenant || isExternalImageUrl(resolved)) return null;

  const pathname = resolved.split(/[?#]/, 1)[0];
  const segments = pathname.split("/").filter(Boolean);
  if (
    segments.length !== 4 ||
    segments[0] !== tenant.slug ||
    segments[1] !== "media" ||
    !catalogMediaKinds.has(segments[2]) ||
    !isSafeMediaFilename(segments[3])
  ) {
    return null;
  }

  return { tenantSlug: tenant.slug, kind: segments[2], filename: segments[3] };
}

export function isExternalImageUrl(value) {
  return Boolean(
    typeof value === "string" &&
      (BROWSER_IMAGE_URL_PATTERN.test(value) || value.startsWith("//"))
  );
}

export function isSafeMediaFilename(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 255) {
    return false;
  }
  const decoded = decodePathSegment(value);
  return Boolean(
    decoded &&
      decoded === value &&
      !decoded.includes("..") &&
      /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(decoded)
  );
}

function isUnsafePathSegment(segment) {
  const decoded = decodePathSegment(segment);
  return (
    !decoded ||
    decoded === "." ||
    decoded === ".." ||
    decoded.includes("/") ||
    decoded.includes("\\")
  );
}

function decodePathSegment(value) {
  try {
    let decoded = value;
    for (let index = 0; index < 3; index += 1) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) return decoded;
      decoded = next;
    }
    return decoded;
  } catch {
    return null;
  }
}
