import "server-only";

import { getCloudflareSaasRuntime } from "./server";
import { DrizzleCloudflareDomainProvisioningRepository } from "./domain-provisioning-repository";
import { CloudflareDomainProvisioningService } from "./domain-provisioning";

let cached:
  | {
      client: ReturnType<typeof getCloudflareSaasRuntime>["client"];
      service: CloudflareDomainProvisioningService;
    }
  | null = null;

export function getCloudflareDomainProvisioningService() {
  const runtime = getCloudflareSaasRuntime();

  if (cached?.client === runtime.client) return cached.service;

  const service = new CloudflareDomainProvisioningService(
    new DrizzleCloudflareDomainProvisioningRepository(),
    runtime.client,
    runtime.config.freeHostnameLimit,
    runtime.config.cnameTarget
  );

  cached = { client: runtime.client, service };
  return service;
}
