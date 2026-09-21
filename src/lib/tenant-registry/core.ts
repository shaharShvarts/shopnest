import type { Tenant } from "@/lib/tenant-routing/core";
import { normalizeTenantSlug } from "@/lib/tenant-validation.mjs";

const SAFE_SCHEMA_PATTERN = /^[a-z0-9_]+$/;
const TRUSTED_TENANT_MARKER = Symbol.for("shopnest.trusted-tenant");
declare const trustedTenantBrand: unique symbol;

export const TENANT_REGISTRY_CACHE_TTL_MS = 5_000;

export type TenantRegistryRecord = {
  slug: string;
  schemaName: string;
  status: "active" | "suspended" | "disabled";
};

export type TrustedTenant = Tenant & {
  readonly [trustedTenantBrand]: true;
};

export interface TenantRegistryRepository {
  findActiveBySlug(slug: string): Promise<TenantRegistryRecord | null>;
}

export function isSafeTenantSchemaName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 63 &&
    SAFE_SCHEMA_PATTERN.test(value) &&
    value !== "public" &&
    value !== "information_schema" &&
    !value.startsWith("pg_")
  );
}

export function trustedTenantFromRegistryRecord(
  record: TenantRegistryRecord
): TrustedTenant | null {
  if (record.status !== "active") return null;

  const normalized = normalizeTenantSlug(record.slug);
  if (!normalized || normalized.slug !== record.slug) return null;
  if (!isSafeTenantSchemaName(record.schemaName)) return null;

  const tenant = {
    slug: record.slug,
    schema: record.schemaName,
    basePath: `/${record.slug}`,
  } as TrustedTenant;

  Object.defineProperty(tenant, TRUSTED_TENANT_MARKER, {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false,
  });

  return Object.freeze(tenant);
}

export function isTrustedTenant(value: Tenant | null): value is TrustedTenant {
  return Boolean(
    value &&
      (value as Tenant & Record<PropertyKey, unknown>)[
        TRUSTED_TENANT_MARKER
      ] === true
  );
}

type CachedTenant = {
  expiresAt: number;
  value: TrustedTenant | null;
};

export class TenantRegistryService {
  private readonly cache = new Map<string, CachedTenant>();

  constructor(
    private readonly repository: TenantRegistryRepository,
    private readonly ttlMs = TENANT_REGISTRY_CACHE_TTL_MS
  ) {}

  async resolve(
    value: unknown,
    now = Date.now()
  ): Promise<TrustedTenant | null> {
    const normalized = normalizeTenantSlug(value);
    if (!normalized) return null;

    const cached = this.cache.get(normalized.slug);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    if (cached) this.cache.delete(normalized.slug);

    const record = await this.repository.findActiveBySlug(
      normalized.slug
    );
    const tenant = record
      ? trustedTenantFromRegistryRecord(record)
      : null;

    this.cache.set(normalized.slug, {
      value: tenant,
      expiresAt: now + this.ttlMs,
    });

    return tenant;
  }

  clear(slug?: string) {
    if (slug) {
      this.cache.delete(slug);
      return;
    }
    this.cache.clear();
  }
}
