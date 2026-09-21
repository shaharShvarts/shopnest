import {
  trustedTenantFromRegistryRecord,
  type TenantRegistryRecord,
  type TrustedTenant,
} from "../tenant-registry/core.ts";

export const DOMAIN_REGISTRY_CACHE_TTL_MS = 5_000;

export type DomainRegistryRecord = {
  hostname: string;
  domainStatus:
    | "pending_verification"
    | "verified"
    | "active"
    | "failed"
    | "removed";
  tenant: TenantRegistryRecord;
};

export type TrustedDomainResolution = {
  hostname: string;
  tenant: TrustedTenant;
};

export interface DomainRegistryRepository {
  findActiveByHostname(hostname: string): Promise<DomainRegistryRecord | null>;
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
  record: DomainRegistryRecord
): TrustedDomainResolution | null {
  const hostname = normalizeCustomDomainHostname(record.hostname);
  if (
    !hostname ||
    hostname !== record.hostname ||
    record.domainStatus !== "active"
  ) {
    return null;
  }

  const tenant = trustedTenantFromRegistryRecord(record.tenant);
  if (!tenant) return null;

  return Object.freeze({ hostname, tenant });
}

type CachedDomain = {
  expiresAt: number;
  value: TrustedDomainResolution | null;
};

export class DomainRegistryService {
  private readonly cache = new Map<string, CachedDomain>();
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
      ? trustedDomainFromRegistryRecord(record)
      : null;

    this.cache.set(hostname, {
      value: resolution,
      expiresAt: now + this.ttlMs,
    });

    return resolution;
  }

  clear(hostname?: string) {
    if (hostname) {
      const normalized = normalizeCustomDomainHostname(hostname);
      if (normalized) this.cache.delete(normalized);
      return;
    }
    this.cache.clear();
  }
}
