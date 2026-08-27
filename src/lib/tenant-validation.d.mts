export type ValidatedTenant = {
  slug: string;
  schema: string;
  basePath: string;
};

export const CONFIGURED_TENANT_SLUGS: readonly string[];

export function normalizeTenantSlug(value: unknown): ValidatedTenant | null;

export function resolveConfiguredTenant(
  value: unknown
): ValidatedTenant | null;
