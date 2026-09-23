import "server-only";

import {
  CloudflareSaasDisabledError,
  readCloudflareSaasConfig,
  type CloudflareSaasConfig,
} from "./core";
import { CloudflareSaasClient } from "./client";

let cached:
  | {
      config: Extract<CloudflareSaasConfig, { enabled: true }>;
      client: CloudflareSaasClient;
    }
  | null = null;

export function getCloudflareSaasRuntime() {
  const config = readCloudflareSaasConfig();
  if (!config.enabled) {
    throw new CloudflareSaasDisabledError();
  }

  if (
    cached &&
    cached.config.apiToken === config.apiToken &&
    cached.config.zoneId === config.zoneId &&
    cached.config.cnameTarget === config.cnameTarget &&
    cached.config.freeHostnameLimit === config.freeHostnameLimit
  ) {
    return cached;
  }

  cached = {
    config,
    client: new CloudflareSaasClient({
      apiToken: config.apiToken,
      zoneId: config.zoneId,
    }),
  };

  return cached;
}
