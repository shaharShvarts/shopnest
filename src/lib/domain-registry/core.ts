import {
  trustedTenantFromRegistryRecord,
  type TenantRegistryRecord,
  type TrustedTenant,
} from "../tenant-registry/core.ts";
import { normalizeTenantSlug } from "../tenant-validation.mjs";

export const DOMAIN_REGISTRY_CACHE_TTL_MS = 5_000;

export type DomainRegistryRecord = {
  hostname: string;
  domainStatus:
    | "pending_verification"
    | "verified"
    | "active"
    | "failed"
    | "removed";
  lifecycleRole: "candidate" | "primary" | "retiring" | null;
  providerHostnameStatus: string | null;
  providerSslStatus: string | null;
  retireAt: Date | null;
  redirectTargetHostname: string | null;
  tenant: TenantRegistryRecord;
};

export type TrustedDomainResolution =
  | {
      kind: "tenant";
      hostname: string;
      tenant: TrustedTenant;
    }
  | {
      kind: "redirect";
      hostname: string;
      targetHostname: string;
    };

export interface DomainRegistryRepository {
  findActiveByHostname(hostname: string): Promise<DomainRegistryRecord | null>;
  findPrimaryByTenantSlug(
    tenantSlug: string
  ): Promise<{ hostname: string } | null>;
}

function validIpv4(hostname: string) {
  const parts = hostname.split(".");
  return (
    parts.length === 4 &&
    parts.every((part) => {
      if (!/^\d{1,3}$/.test(part)) return false;
      const value = Number(part);
      return value >= 0 && value <= 255;
    })
  );
}

export function normalizeRequestHostname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (
    !raw ||
    raw.length > 300 ||
    /[\u0000-\u0020\\/@?#]/.test(raw)
  ) {
    return null;
  }

  let hostname: string;
  try {
    hostname = new URL(`http://${raw}`).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (hostname.endsWith(".")) hostname = hostname.slice(0, -1);

  return hostname || null;
}

export function normalizeCustomDomainHostname(
  value: unknown
): string | null {
  const hostname = normalizeRequestHostname(value);
  if (
    !hostname ||
    hostname.length > 253 ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.includes(":") ||
    validIpv4(hostname) ||
    !hostname.includes(".")
  ) {
    return null;
  }

  const labels = hostname.split(".");
  if (
    labels.some(
      (label) =>
        label.length < 1 ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
    )
  ) {
    return null;
  }

  return hostname;
}

export function isPlatformHostname(value: unknown) {
  const hostname = normalizeRequestHostname(value);
  if (!hostname) return false;

  return (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "shopnest.co.il" ||
    hostname.endsWith(".shopnest.co.il") ||
    hostname.includes(":") ||
    validIpv4(hostname)
  );
}

export function trustedDomainFromRegistryRecord(
  record: DomainRegistryRecord,
  now = Date.now()
): TrustedDomainResolution | null {
  const hostname = normalizeCustomDomainHostname(record.hostname);
  if (
    !hostname ||
    hostname !== record.hostname ||
    record.domainStatus !== "active" ||
    record.providerHostnameStatus !== "active" ||
    record.providerSslStatus !== "active"
  ) {
    return null;
  }

  const tenant = trustedTenantFromRegistryRecord(record.tenant);
  if (!tenant) return null;

  if (record.lifecycleRole === "primary") {
    return Object.freeze({
      kind: "tenant" as const,
      hostname,
      tenant,
    });
  }

  if (
    record.lifecycleRole !== "retiring" ||
    !record.retireAt ||
    record.retireAt.getTime() <= now
  ) {
    return null;
  }

  const targetHostname = normalizeCustomDomainHostname(
    record.redirectTargetHostname
  );
  if (
    !targetHostname ||
    targetHostname !== record.redirectTargetHostname ||
    targetHostname === hostname
  ) {
    return null;
  }

  return Object.freeze({
    kind: "redirect" as const,
    hostname,
    targetHostname,
  });
}

type CachedDomain = {
  expiresAt: number;
  value: TrustedDomainResolution | null;
};

type CachedPrimaryDomain = {
  expiresAt: number;
  value: string | null;
};

export class DomainRegistryService {
  private readonly cache = new Map<string, CachedDomain>();
  private readonly primaryCache = new Map<string, CachedPrimaryDomain>();
  private readonly repository: DomainRegistryRepository;
  private readonly ttlMs: number;

  constructor(
    repository: DomainRegistryRepository,
    ttlMs = DOMAIN_REGISTRY_CACHE_TTL_MS
  ) {
    this.repository = repository;
    this.ttlMs = ttlMs;
  }

  async resolve(
    value: unknown,
    now = Date.now()
  ): Promise<TrustedDomainResolution | null> {
    const hostname = normalizeCustomDomainHostname(value);
    if (!hostname) return null;

    const cached = this.cache.get(hostname);
    if (cached && cached.expiresAt > now) return cached.value;
    if (cached) this.cache.delete(hostname);

    const record = await this.repository.findActiveByHostname(hostname);
    const resolution = record
      ? trustedDomainFromRegistryRecord(record, now)
      : null;

    this.cache.set(hostname, {
      value: resolution,
      expiresAt: now + this.ttlMs,
    });

    return resolution;
  }

  async resolvePrimaryDomainForTenantSlug(
    value: unknown,
    now = Date.now()
  ): Promise<string | null> {
    const tenant = normalizeTenantSlug(value);
    if (!tenant) return null;

    const cached = this.primaryCache.get(tenant.slug);
    if (cached && cached.expiresAt > now) return cached.value;
    if (cached) this.primaryCache.delete(tenant.slug);

    const record = await this.repository.findPrimaryByTenantSlug(tenant.slug);
    const hostname = record
      ? normalizeCustomDomainHostname(record.hostname)
      : null;
    const valueToCache =
      hostname && hostname === record?.hostname ? hostname : null;

    this.primaryCache.set(tenant.slug, {
      value: valueToCache,
      expiresAt: now + this.ttlMs,
    });

    return valueToCache;
  }

  clear(hostname?: string) {
    if (hostname) {
      const normalized = normalizeCustomDomainHostname(hostname);
      if (normalized) this.cache.delete(normalized);
      this.primaryCache.clear();
      return;
    }
    this.cache.clear();
    this.primaryCache.clear();
  }
}
