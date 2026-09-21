import "server-only";

import { DrizzleTenantRegistryRepository } from "./drizzle-repository";
import { TenantRegistryService } from "./core";

const repository = new DrizzleTenantRegistryRepository();
const service = new TenantRegistryService(repository);

export function resolveTrustedTenant(value: unknown) {
  return service.resolve(value);
}

export function getTenantRegistryService() {
  return service;
}
