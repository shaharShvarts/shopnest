import "server-only";

import { DrizzleOrganizationRepository } from "./drizzle-repository";

const repository = new DrizzleOrganizationRepository();

export function getMerchantOrganizationRepository() {
  return repository;
}
