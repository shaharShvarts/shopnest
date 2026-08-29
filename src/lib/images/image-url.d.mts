export const CATALOG_MEDIA_KINDS: readonly [
  "categories",
  "subcategories",
  "products",
];
export type CatalogMediaKind = (typeof CATALOG_MEDIA_KINDS)[number];
export const SUPPORTED_IMAGE_CONTENT_TYPES: readonly string[];

export function normalizeImageUrl(value: unknown): string | null;
export function resolveTenantImageUrl(
  value: unknown,
  tenantSlug: unknown
): string | null;
export function createTenantMediaUrl(
  tenantSlug: unknown,
  kind: unknown,
  filename: unknown
): string | null;
export function parseTenantMediaUrl(
  value: unknown,
  expectedTenantSlug: unknown
): { tenantSlug: string; kind: CatalogMediaKind; filename: string } | null;
export function isExternalImageUrl(value: unknown): boolean;
export function isSafeMediaFilename(value: unknown): boolean;
