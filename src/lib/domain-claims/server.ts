import "server-only";

import { resolveCname, resolveSoa, resolveTxt } from "node:dns/promises";
import { DrizzleStoreDomainClaimRepository } from "./drizzle-repository";
import { DomainOwnershipClaimService } from "./core";

const repository = new DrizzleStoreDomainClaimRepository();

const service = new DomainOwnershipClaimService(repository, {
  resolveTxt,
  resolveCname,
  resolveSoa,
});

export function getStoreDomainClaimRepository() {
  return repository;
}

export function getDomainOwnershipClaimService() {
  return service;
}
