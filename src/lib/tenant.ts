export {
  CONFIGURED_TENANT_SLUGS,
  normalizeTenantSlug,
  resolveConfiguredTenant,
} from "./tenant-validation.mjs";
export {
  buildTenantRewriteUrl,
  INTERNAL_PATH_HEADER,
  LEGACY_ROUTE_SEGMENTS,
  prefixTenantPath,
  resolveTenantRoute,
  TENANT_HEADER,
  TENANT_SCHEMA_HEADER,
  type Tenant,
  type TenantRouteResolution,
} from "./tenant-routing/core";
