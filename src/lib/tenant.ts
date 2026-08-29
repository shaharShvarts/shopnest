import {
  resolveConfiguredTenant,
  type ValidatedTenant,
} from "./tenant-validation.mjs";

export {
  CONFIGURED_TENANT_SLUGS,
  normalizeTenantSlug,
  resolveConfiguredTenant,
} from "./tenant-validation.mjs";

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
  "shopnest",
]);

export const TENANT_HEADER = "x-shopnest-tenant-slug";
export const TENANT_SCHEMA_HEADER = "x-shopnest-tenant-schema";
export const INTERNAL_PATH_HEADER = "x-shopnest-internal-path";

export type Tenant = ValidatedTenant;

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
