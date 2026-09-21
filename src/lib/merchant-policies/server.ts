import "server-only";

import { DrizzleMerchantPolicyRepository } from "./drizzle-repository";

const repository = new DrizzleMerchantPolicyRepository();

export function getMerchantPolicyRepository() {
  return repository;
}
