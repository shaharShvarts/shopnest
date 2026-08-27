const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CONFIGURED_TENANT_SLUGS = [
  "panda-pop",
  "dvorik-collection",
  "gift-shop",
] as const;

export const LEGACY_ROUTE_SEGMENTS = new Set([
  "admin",
  "api",
  "carts",
  "categories",
  "checkout",
  "login",
  "privacy-policy",
  "products",
  "shipping",
]);

export const TENANT_HEADER = "x-shopnest-tenant-slug";
export const TENANT_SCHEMA_HEADER = "x-shopnest-tenant-schema";

export type Tenant = {
  slug: string;
  schema: string;
  basePath: string;
};

export function normalizeTenantSlug(value: string): Tenant | null {
  const slug = value.trim().toLowerCase();

  if (!TENANT_SLUG_PATTERN.test(slug)) return null;

  const schema = slug.replaceAll("-", "_");
  if (schema.length > 63) return null;

  return { slug, schema, basePath: `/${slug}` };
}

const configuredTenants = new Map<string, Tenant>(
  CONFIGURED_TENANT_SLUGS.map((slug) => {
    const tenant = normalizeTenantSlug(slug);
    if (!tenant) throw new Error(`Invalid configured tenant slug: ${slug}`);
    return [slug, tenant];
  })
);

export function resolveConfiguredTenant(value: string): Tenant | null {
  const tenant = normalizeTenantSlug(value);
  if (!tenant) return null;
  return configuredTenants.get(tenant.slug) ?? null;
}

export type TenantRouteResolution =
  | { kind: "legacy" }
  | { kind: "not-found" }
  | { kind: "tenant"; tenant: Tenant; internalPath: string };

export function resolveTenantRoute(pathname: string): TenantRouteResolution {
  const [firstSegment, ...rest] = pathname.split("/").filter(Boolean);

  if (!firstSegment || LEGACY_ROUTE_SEGMENTS.has(firstSegment)) {
    return { kind: "legacy" };
  }

  const tenant = resolveConfiguredTenant(firstSegment);
  if (!tenant) return { kind: "not-found" };

  return {
    kind: "tenant",
    tenant,
    internalPath: rest.length === 0 ? "/" : `/${rest.join("/")}`,
  };
}

export function prefixTenantPath(path: string, basePath: string) {
  if (!basePath || !path.startsWith("/") || path.startsWith("//")) {
    return path;
  }

  if (path === basePath || path.startsWith(`${basePath}/`)) return path;

  return path === "/" ? basePath : `${basePath}${path}`;
}
