import "server-only";

import { getDomainRegistryService } from "@/lib/domain-registry/server";
import { getCloudflareSaasRuntime } from "./server";
import { DrizzleCloudflareDomainSyncRepository } from "./domain-sync-repository";
import { CloudflareDomainSyncService } from "./domain-sync";

let cached:
  | {
      provider: ReturnType<typeof getCloudflareSaasRuntime>["client"];
      service: CloudflareDomainSyncService;
    }
  | null = null;

export function getCloudflareDomainSyncService() {
  const { client } = getCloudflareSaasRuntime();

  if (cached?.provider === client) return cached.service;

  const service = new CloudflareDomainSyncService(
    new DrizzleCloudflareDomainSyncRepository(),
    client,
    (hostname) => getDomainRegistryService().clear(hostname)
  );

  cached = { provider: client, service };
  return service;
}
