import "server-only";

import { DrizzleMerchantStoreRepository } from "./drizzle-repository";

const repository = new DrizzleMerchantStoreRepository();

export function getMerchantStoreRepository() {
  return repository;
}
