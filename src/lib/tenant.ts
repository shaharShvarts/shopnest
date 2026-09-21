export {
  CONFIGURED_TENANT_SLUGS,
  normalizeTenantSlug,
  resolveConfiguredTenant,
} from "./tenant-validation.mjs";
export {
  buildHostedTenantRewriteUrl,
  buildTenantRewriteUrl,
  INTERNAL_PATH_HEADER,
  LEGACY_ROUTE_SEGMENTS,
  prefixTenantPath,
  resolveTenantRoute,
  isGlobalApiPath,
  isTenantAdminPath,
  isTenantHandlerPath,
  TENANT_HEADER,
  TENANT_ROUTE_MODE_HEADER,
  TENANT_SCHEMA_HEADER,
  type Tenant,
  type TenantRouteMode,
  type TenantRouteResolution,
} from "./tenant-routing/core";
