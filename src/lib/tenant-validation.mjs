const TENANT_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const CONFIGURED_TENANT_SLUGS = Object.freeze([
  "panda-pop",
  "dvorik-collection",
  "gift-shop",
]);

export function normalizeTenantSlug(value) {
  if (typeof value !== "string") return null;

  const slug = value.trim().toLowerCase();
  if (!TENANT_SLUG_PATTERN.test(slug)) return null;

  const schema = slug.replaceAll("-", "_");
  if (schema.length > 63) return null;

  return { slug, schema, basePath: `/${slug}` };
}

const configuredTenants = new Map(
  CONFIGURED_TENANT_SLUGS.map((slug) => {
    const tenant = normalizeTenantSlug(slug);
    if (!tenant) throw new Error(`Invalid configured tenant slug: ${slug}`);
    return [slug, tenant];
  })
);

export function resolveConfiguredTenant(value) {
  const tenant = normalizeTenantSlug(value);
  if (!tenant) return null;
  return configuredTenants.get(tenant.slug) ?? null;
}
