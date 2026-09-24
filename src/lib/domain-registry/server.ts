import "server-only";

import { DomainRegistryService } from "./core";
import { DrizzleDomainRegistryRepository } from "./drizzle-repository";

const repository = new DrizzleDomainRegistryRepository();
const service = new DomainRegistryService(repository);

export function resolveTrustedDomain(value: unknown) {
  return service.resolve(value);
}

export function resolvePrimaryDomainForTenantSlug(value: unknown) {
  return service.resolvePrimaryDomainForTenantSlug(value);
}

export function getDomainRegistryService() {
  return service;
}
