import assert from "node:assert/strict";
import test from "node:test";
import {
  CloudflareDomainSyncService,
  type CloudflareDomainSyncRecord,
  type CloudflareDomainSyncRepository,
  type CloudflareDomainSyncUpdate,
} from "../src/lib/cloudflare-saas/domain-sync.ts";
import type { CloudflareCustomHostname } from "../src/lib/cloudflare-saas/core.ts";

class FakeRepository implements CloudflareDomainSyncRepository {
  record: CloudflareDomainSyncRecord | null = null;
  updates: CloudflareDomainSyncUpdate[] = [];
  errors: string[] = [];

  async findByHostname() {
    return this.record;
  }

  async applySync(_id: number, update: CloudflareDomainSyncUpdate) {
    assert.ok(this.record);
    this.updates.push(update);
    this.record = {
      ...this.record,
      domainStatus: update.domainStatus ?? this.record.domainStatus,
    };
    return this.record;
  }

  async recordProviderError(_id: number, errorCode: string) {
    this.errors.push(errorCode);
  }
}

class FakeProvider {
  result: CloudflareCustomHostname = {
    id: "provider-id",
    hostname: "store.example",
    status: "pending",
    sslStatus: "pending_validation",
  };

  async getCustomHostname() {
    return this.result;
  }
}

function managedRecord(): CloudflareDomainSyncRecord {
  return {
    id: 1,
    hostname: "store.example",
    domainStatus: "pending_verification",
    provider: "cloudflare",
    providerHostnameId: "provider-id",
    tenantStatus: "active",
  };
}

test("Cloudflare sync promotes only active hostname plus active SSL for an active Tenant", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  const cleared: string[] = [];
  repository.record = managedRecord();
  provider.result = {
    id: "provider-id",
    hostname: "store.example",
    status: "active",
    sslStatus: "active",
  };

  const service = new CloudflareDomainSyncService(
    repository,
    provider,
    (hostname) => cleared.push(hostname)
  );

  const now = new Date("2026-09-22T16:00:00Z");
  const result = await service.syncByHostname("store.example", now);

  assert.equal(result.kind, "synced");
  if (result.kind !== "synced") return;
  assert.equal(result.ready, true);
  assert.equal(result.domainStatus, "active");
  assert.equal(repository.updates[0]?.verifiedAt, now);
  assert.deepEqual(cleared, ["store.example"]);
});

test("Cloudflare sync keeps hostname non-routable while SSL is pending", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  repository.record = managedRecord();
  provider.result = {
    id: "provider-id",
    hostname: "store.example",
    status: "active",
    sslStatus: "pending_validation",
  };

  const service = new CloudflareDomainSyncService(
    repository,
    provider,
    () => {}
  );

  const result = await service.syncByHostname("store.example");

  assert.equal(result.kind, "synced");
  if (result.kind !== "synced") return;
  assert.equal(result.ready, false);
  assert.equal(result.domainStatus, "pending_verification");
  assert.equal(repository.updates[0]?.verifiedAt, undefined);
});

test("Cloudflare sync never activates a domain for an inactive Tenant", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  repository.record = {
    ...managedRecord(),
    tenantStatus: "suspended",
  };
  provider.result = {
    id: "provider-id",
    hostname: "store.example",
    status: "active",
    sslStatus: "active",
  };

  const service = new CloudflareDomainSyncService(
    repository,
    provider,
    () => {}
  );

  const result = await service.syncByHostname("store.example");

  assert.equal(result.kind, "synced");
  if (result.kind !== "synced") return;
  assert.equal(result.ready, false);
  assert.equal(result.domainStatus, "pending_verification");
});

test("Cloudflare sync rejects provider hostname mismatch and records safe error code", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  repository.record = managedRecord();
  provider.result = {
    id: "provider-id",
    hostname: "other.example",
    status: "active",
    sslStatus: "active",
  };

  const service = new CloudflareDomainSyncService(
    repository,
    provider,
    () => {}
  );

  await assert.rejects(
    () => service.syncByHostname("store.example"),
    /provider hostname mismatch/
  );
  assert.deepEqual(repository.errors, ["PROVIDER_HOSTNAME_MISMATCH"]);
  assert.equal(repository.updates.length, 0);
});

test("removed and unmanaged domains never call Cloudflare", async () => {
  const repository = new FakeRepository();
  let providerCalls = 0;
  const provider = {
    async getCustomHostname() {
      providerCalls += 1;
      throw new Error("must not be called");
    },
  };

  repository.record = {
    ...managedRecord(),
    domainStatus: "removed",
  };

  const service = new CloudflareDomainSyncService(
    repository,
    provider,
    () => {}
  );

  const removed = await service.syncByHostname("store.example");
  assert.equal(removed.kind, "not_managed");
  assert.equal(providerCalls, 0);

  repository.record = {
    ...managedRecord(),
    provider: null,
    providerHostnameId: null,
  };
  const unmanaged = await service.syncByHostname("store.example");
  assert.equal(unmanaged.kind, "not_managed");
  assert.equal(providerCalls, 0);
});
