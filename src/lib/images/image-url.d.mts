export const CATALOG_MEDIA_KINDS: readonly [
  "categories",
  "subcategories",
  "products",
];
export type CatalogMediaKind = (typeof CATALOG_MEDIA_KINDS)[number];

export type TenantImageIdentity = {
  slug: string;
  basePath: string;
};

export type TenantImageResolver = (
  value: unknown
) => TenantImageIdentity | null;

export function normalizeImageUrl(
  value: unknown,
  resolveTenant?: TenantImageResolver
): string | null;

export function resolveTenantImageUrl(
  value: unknown,
  tenantSlug: unknown,
  resolveTenant?: TenantImageResolver
): string | null;

export function createTenantMediaUrl(
  tenantSlug: unknown,
  kind: unknown,
  filename: unknown,
  resolveTenant?: TenantImageResolver
): string | null;

export function parseTenantMediaUrl(
  value: unknown,
  expectedTenantSlug: unknown,
  resolveTenant?: TenantImageResolver
): { tenantSlug: string; kind: CatalogMediaKind; filename: string } | null;

export function isExternalImageUrl(value: unknown): boolean;
export function isSafeMediaFilename(value: unknown): boolean;
