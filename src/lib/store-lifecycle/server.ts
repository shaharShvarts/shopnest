import "server-only";

import { getStoreReadinessRepository } from "@/lib/store-readiness/server";
import { DrizzleStoreLifecycleRepository } from "./drizzle-repository";
import { StoreLifecycleService } from "./service";

const repository = new DrizzleStoreLifecycleRepository();
const service = new StoreLifecycleService(
  repository,
  getStoreReadinessRepository()
);

export function getStoreLifecycleRepository() {
  return repository;
}

export function getStoreLifecycleService() {
  return service;
}
