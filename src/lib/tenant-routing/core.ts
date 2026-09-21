import {
  normalizeTenantSlug,
  resolveConfiguredTenant,
  type ValidatedTenant,
} from "../tenant-validation.mjs";

export const GLOBAL_PAGE_ROUTE_SEGMENTS = Object.freeze([
  "admin",
  "features",
  "pricing",
  "examples",
  "faq",
  "login",
  "signup",
  "forgot-password",
  "reset-password",
  "dashboard",
] as const);

export const LEGACY_ROUTE_SEGMENTS = new Set<string>(
  GLOBAL_PAGE_ROUTE_SEGMENTS
);

export const STORE_RESERVED_ROUTE_SEGMENTS = new Set<string>([
  ...GLOBAL_PAGE_ROUTE_SEGMENTS,
  "api",
  "media",
  "static",
  "_next",
]);

const GLOBAL_API_PATHS = new Set([
  "/api/customer-auth/google/callback",
  "/api/iCount/payment",
]);

export function isTenantHandlerPath(path: string) {
  return path.startsWith("/api/") || path.startsWith("/media/");
}

export const TENANT_HEADER = "x-shopnest-tenant-slug";
export const TENANT_SCHEMA_HEADER = "x-shopnest-tenant-schema";
export const INTERNAL_PATH_HEADER = "x-shopnest-internal-path";

export type Tenant = ValidatedTenant;
export type TenantResolver = (value: unknown) => Tenant | null;
export type AsyncTenantResolver = (
  value: unknown
) => Promise<Tenant | null>;

export type TenantRouteResolution =
  | { kind: "legacy" }
  | { kind: "not-found" }
  | { kind: "tenant"; tenant: Tenant; internalPath: string };

export function buildTenantRewriteUrl(requestUrl: URL, internalPath: string) {
  const rewriteUrl = new URL(requestUrl.toString());
  if (isTenantHandlerPath(internalPath)) rewriteUrl.pathname = internalPath;
  return rewriteUrl;
}

export function isTenantAdminPath(internalPath: string) {
  return internalPath === "/admin" || internalPath.startsWith("/admin/");
}

export function resolveTenantRoute(
  pathname: string,
  resolveTenant: TenantResolver = resolveConfiguredTenant
): TenantRouteResolution {
  const [firstSegment, ...rest] = pathname.split("/").filter(Boolean);

  if (
    !firstSegment ||
    LEGACY_ROUTE_SEGMENTS.has(firstSegment) ||
    GLOBAL_API_PATHS.has(pathname.replace(/\/$/, ""))
  ) {
    return { kind: "legacy" };
  }

  const tenant = resolveTenant(firstSegment);
  if (!tenant) return { kind: "not-found" };

  // Global callbacks must use their canonical URL and state-bound tenant.
  if (GLOBAL_API_PATHS.has("/" + rest.join("/"))) {
    return { kind: "not-found" };
  }

  return {
    kind: "tenant",
    tenant,
    internalPath: rest.length === 0 ? "/" : "/" + rest.join("/"),
  };
}

export async function resolveTenantRouteAsync(
  pathname: string,
  resolveTenant: AsyncTenantResolver
): Promise<TenantRouteResolution> {
  const [firstSegment, ...rest] = pathname.split("/").filter(Boolean);

  if (
    !firstSegment ||
    LEGACY_ROUTE_SEGMENTS.has(firstSegment) ||
    GLOBAL_API_PATHS.has(pathname.replace(/\/$/, ""))
  ) {
    return { kind: "legacy" };
  }

  const tenant = await resolveTenant(firstSegment);
  if (!tenant) return { kind: "not-found" };

  // Global callbacks must use their canonical URL and state-bound tenant.
  if (GLOBAL_API_PATHS.has("/" + rest.join("/"))) {
    return { kind: "not-found" };
  }

  return {
    kind: "tenant",
    tenant,
    internalPath: rest.length === 0 ? "/" : "/" + rest.join("/"),
  };
}

export function prefixTenantPath(
  path: string,
  basePath: string
) {
  const baseSlug =
    basePath.startsWith("/") && !basePath.slice(1).includes("/")
      ? basePath.slice(1)
      : "";
  const normalizedBase = normalizeTenantSlug(baseSlug);

  if (!normalizedBase || normalizedBase.basePath !== basePath) {
    throw new Error("Tenant navigation requires a valid tenant base path");
  }

  if (path.startsWith("#") || path.startsWith("?")) return path;

  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(path)
  ) {
    throw new Error("Tenant navigation requires a local absolute path");
  }

  const rawPath = path.split(/[?#]/)[0];
  if (/%2f|%5c/i.test(rawPath)) {
    throw new Error("Unsafe tenant navigation path");
  }

  let rawDecoded: string;
  try {
    rawDecoded = decodeURIComponent(rawPath);
  } catch {
    throw new Error("Unsafe tenant navigation path");
  }

  if (
    rawDecoded.includes("\\") ||
    rawDecoded
      .split("/")
      .some((segment) => segment === "." || segment === "..")
  ) {
    throw new Error("Unsafe tenant navigation path");
  }

  const url = new URL(path, "https://shopnest.invalid");

  if (
    url.pathname === basePath ||
    url.pathname.startsWith(basePath + "/")
  ) {
    return url.pathname + url.search + url.hash;
  }

  return (
    basePath +
    (url.pathname === "/" ? "" : url.pathname) +
    url.search +
    url.hash
  );
}
