import { CONFIGURED_TENANT_SLUGS } from "../tenant-validation.mjs";

const BROWSER_IMAGE_URL_PATTERN = /^(?:https?:|data:|blob:)/i;
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const CATALOG_IMAGE_DIRECTORIES = new Set([
  "categories",
  "subcategories",
  "products",
]);

export function normalizeImageUrl(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[a-z]:[\\/]/i.test(trimmed)) return null;
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
  if (segments.some(isTraversalSegment)) return null;

  if (
    CONFIGURED_TENANT_SLUGS.includes(segments[0]) &&
    CATALOG_IMAGE_DIRECTORIES.has(segments[1])
  ) {
    segments.shift();
  }

  if (segments.length === 0) return null;
  return `/${segments.join("/")}${suffix}`;
}

function isTraversalSegment(segment) {
  try {
    const decoded = decodeURIComponent(segment);
    return decoded === "." || decoded === "..";
  } catch {
    return true;
  }
}

export function isLocalPublicImageUrl(value) {
  const normalized = normalizeImageUrl(value);
  return Boolean(normalized?.startsWith("/") && !normalized.startsWith("//"));
}
