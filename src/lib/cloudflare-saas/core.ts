import { normalizeCustomDomainHostname } from "../domain-registry/core.ts";

export const CLOUDFLARE_SAAS_DEFAULT_FREE_HOSTNAME_LIMIT = 100;
export const CLOUDFLARE_SAAS_MAX_FREE_HOSTNAME_LIMIT = 100;

export type CloudflareCustomHostname = {
  id: string;
  hostname: string;
  status: string;
  sslStatus: string | null;
};

export type CloudflareSaasConfig =
  | { enabled: false }
  | {
      enabled: true;
      apiToken: string;
      zoneId: string;
      cnameTarget: string;
      freeHostnameLimit: number;
    };

export class CloudflareSaasDisabledError extends Error {
  constructor() {
    super("Cloudflare SaaS integration is disabled");
    this.name = "CloudflareSaasDisabledError";
  }
}

function requireString(
  env: NodeJS.ProcessEnv,
  key: string
): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required when Cloudflare SaaS is enabled`);
  return value;
}

export function canonicalCloudflareHostname(value: unknown): string | null {
  const hostname = normalizeCustomDomainHostname(value);
  if (!hostname || hostname.startsWith("*.")) return null;
  return hostname;
}

export function readCloudflareSaasConfig(
  env: NodeJS.ProcessEnv = process.env
): CloudflareSaasConfig {
  const enabledRaw = env.CLOUDFLARE_SAAS_ENABLED?.trim();

  if (!enabledRaw || enabledRaw === "false") return { enabled: false };
  if (enabledRaw !== "true") {
    throw new Error("CLOUDFLARE_SAAS_ENABLED must be true or false");
  }

  const apiToken = requireString(env, "CLOUDFLARE_API_TOKEN");
  const zoneId = requireString(env, "CLOUDFLARE_ZONE_ID");
  const cnameTargetRaw = requireString(env, "CLOUDFLARE_SAAS_CNAME_TARGET");
  const cnameTarget = canonicalCloudflareHostname(cnameTargetRaw);

  if (!/^[a-f0-9]{32}$/i.test(zoneId)) {
    throw new Error("CLOUDFLARE_ZONE_ID must be a 32-character hexadecimal zone identifier");
  }
  if (!cnameTarget || cnameTarget !== cnameTargetRaw.toLowerCase()) {
    throw new Error("CLOUDFLARE_SAAS_CNAME_TARGET must be a canonical exact hostname");
  }

  const limitRaw =
    env.CLOUDFLARE_SAAS_FREE_HOSTNAME_LIMIT?.trim() ??
    String(CLOUDFLARE_SAAS_DEFAULT_FREE_HOSTNAME_LIMIT);
  const freeHostnameLimit = Number(limitRaw);

  if (
    !Number.isInteger(freeHostnameLimit) ||
    freeHostnameLimit < 1 ||
    freeHostnameLimit > CLOUDFLARE_SAAS_MAX_FREE_HOSTNAME_LIMIT
  ) {
    throw new Error(
      `CLOUDFLARE_SAAS_FREE_HOSTNAME_LIMIT must be an integer from 1 to ${CLOUDFLARE_SAAS_MAX_FREE_HOSTNAME_LIMIT}`
    );
  }

  return {
    enabled: true,
    apiToken,
    zoneId: zoneId.toLowerCase(),
    cnameTarget,
    freeHostnameLimit,
  };
}

export function isCloudflareCustomHostnameReady(
  hostname: CloudflareCustomHostname
) {
  return hostname.status === "active" && hostname.sslStatus === "active";
}
