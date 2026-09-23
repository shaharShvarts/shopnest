import "server-only";

import { getDomainRegistryService } from "@/lib/domain-registry/server";
import { getCloudflareSaasRuntime } from "./server";
import { DrizzleCloudflareDomainRemovalRepository } from "./domain-removal-repository";
import { CloudflareDomainRemovalService } from "./domain-removal";

let cached:
  | {
      provider: ReturnType<typeof getCloudflareSaasRuntime>["client"];
      service: CloudflareDomainRemovalService;
    }
  | null = null;

export function getCloudflareDomainRemovalService() {
  const { client } = getCloudflareSaasRuntime();

  if (cached?.provider === client) return cached.service;

  const service = new CloudflareDomainRemovalService(
    new DrizzleCloudflareDomainRemovalRepository(),
    client,
    (hostname) => getDomainRegistryService().clear(hostname)
  );

  cached = { provider: client, service };
  return service;
}
