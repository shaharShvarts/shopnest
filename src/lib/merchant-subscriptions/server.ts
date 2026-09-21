import "server-only";

import { DrizzleMerchantSubscriptionRepository } from "./drizzle-repository";

const repository = new DrizzleMerchantSubscriptionRepository();

export function getMerchantSubscriptionRepository() {
  return repository;
}
