import "server-only";

import { DrizzleStoreReadinessRepository } from "./drizzle-repository";

const repository = new DrizzleStoreReadinessRepository();

export function getStoreReadinessRepository() {
  return repository;
}
