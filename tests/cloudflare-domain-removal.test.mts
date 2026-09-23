import assert from "node:assert/strict";
import test from "node:test";
import {
  CloudflareDomainRemovalService,
  type CloudflareDomainRemovalRepository,
  type DomainRemovalReservation,
} from "../src/lib/cloudflare-saas/domain-removal.ts";

class FakeRepository implements CloudflareDomainRemovalRepository {
  reservation: DomainRemovalReservation = {
    kind: "ready",
    domainId: 7,
    hostname: "shop.customer.example",
    providerHostnameId: "cf-hostname-id",
  };
  prepared = 0;
  finalized = 0;
  errors: string[] = [];

  async prepareRemoval() {
    this.prepared += 1;
    return this.reservation;
  }

  async finalizeRemoval() {
    this.finalized += 1;
  }

  async recordRemovalError(input: { errorCode: string }) {
    this.errors.push(input.errorCode);
  }
}

class FakeProvider {
  deleteCalls = 0;
  failDelete = false;

  async deleteCustomHostname() {
    this.deleteCalls += 1;
    if (this.failDelete) throw new Error("provider unavailable");
  }
}

test("removal makes the domain non-routable and clears cache before provider deletion", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  const events: string[] = [];

  provider.deleteCustomHostname = async () => {
    events.push("provider-delete");
    provider.deleteCalls += 1;
  };

  const service = new CloudflareDomainRemovalService(
    repository,
    provider,
    (hostname) => events.push(`cache-clear:${hostname}`)
  );

  const result = await service.removeOwnedDomain(
    10,
    20,
    "shop.customer.example",
    new Date("2026-09-23T10:00:00Z")
  );

  assert.equal(result.kind, "removed");
  assert.equal(repository.prepared, 1);
  assert.equal(repository.finalized, 1);
  assert.equal(provider.deleteCalls, 1);
  assert.deepEqual(events, [
    "cache-clear:shop.customer.example",
    "provider-delete",
  ]);
});

test("provider delete failure stays locally non-routable and records a retryable error", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  provider.failDelete = true;
  const cleared: string[] = [];

  const service = new CloudflareDomainRemovalService(
    repository,
    provider,
    (hostname) => cleared.push(hostname)
  );

  await assert.rejects(() =>
    service.removeOwnedDomain(
      10,
      20,
      "shop.customer.example",
      new Date("2026-09-23T10:00:00Z")
    )
  );

  assert.equal(repository.prepared, 1);
  assert.equal(repository.finalized, 0);
  assert.deepEqual(repository.errors, ["CLOUDFLARE_DELETE_ERROR"]);
  assert.deepEqual(cleared, ["shop.customer.example"]);
});

test("removed domain with no provider id is idempotent", async () => {
  const repository = new FakeRepository();
  repository.reservation = {
    kind: "already_removed",
    hostname: "shop.customer.example",
  };
  const provider = new FakeProvider();

  const service = new CloudflareDomainRemovalService(
    repository,
    provider,
    () => {}
  );

  const result = await service.removeOwnedDomain(
    10,
    20,
    "shop.customer.example"
  );

  assert.deepEqual(result, {
    kind: "already_removed",
    hostname: "shop.customer.example",
  });
  assert.equal(provider.deleteCalls, 0);
  assert.equal(repository.finalized, 0);
});
