import {
  CONFIGURED_TENANT_SLUGS,
  resolveConfiguredTenant,
} from "../src/lib/tenant-validation.mjs";

console.log("Configured ShopNest tenants:");

for (const slug of CONFIGURED_TENANT_SLUGS) {
  const tenant = resolveConfiguredTenant(slug);
  if (!tenant) throw new Error(`Invalid configured tenant: ${slug}`);
  console.log(`${tenant.slug} -> ${tenant.schema}`);
}
