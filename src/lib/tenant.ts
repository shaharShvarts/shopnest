const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

export function prefixTenantPath(path: string, basePath: string) {
  if (!basePath || !path.startsWith("/") || path.startsWith("//")) {
    return path;
  }

  if (path === basePath || path.startsWith(`${basePath}/`)) return path;

  return path === "/" ? basePath : `${basePath}${path}`;
}
