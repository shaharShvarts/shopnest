import assert from "node:assert/strict";
import test from "node:test";
import {
  CloudflareDomainProvisioningError,
  CloudflareDomainProvisioningService,
  type CloudflareDomainProvisioningRepository,
  type DomainProvisioningFinalizeResult,
  type DomainProvisioningReservation,
} from "../src/lib/cloudflare-saas/domain-provisioning.ts";
import type { CloudflareCustomHostname } from "../src/lib/cloudflare-saas/core.ts";

class FakeRepository implements CloudflareDomainProvisioningRepository {
  reservation: DomainProvisioningReservation = {
    kind: "ready",
    claimId: 1,
    domainId: 2,
    hostname: "shop.customer.example",
    tenantId: 3,
    providerHostnameId: null,
    claimAlreadyConsumed: false,
  };
  reserveInputs: Array<Record<string, unknown>> = [];
  finalized: DomainProvisioningFinalizeResult | null = null;
  errors: string[] = [];

  async reserveVerifiedClaim(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
    verificationToken: string;
    providerCount: number;
    freeHostnameLimit: number;
    needsProviderCreate: boolean;
    leaseMs: number;
    now: Date;
  }) {
    this.reserveInputs.push(input);
    if (
      input.needsProviderCreate &&
      input.providerCount >= input.freeHostnameLimit
    ) {
      throw new CloudflareDomainProvisioningError(
        "PROVIDER_QUOTA_EXHAUSTED",
        "quota"
      );
    }
    return this.reservation;
  }

  async finalizeProvisioning(input: {
    claimId: number;
    domainId: number;
    hostname: string;
    tenantId: number;
    providerHostname: CloudflareCustomHostname;
    now: Date;
  }) {
    this.finalized = {
      claimId: input.claimId,
      domainId: input.domainId,
      hostname: input.hostname,
      tenantId: input.tenantId,
      providerHostnameId: input.providerHostname.id,
      claimConsumedAt: input.now,
    };
    return this.finalized;
  }

  async recordProvisioningError(input: {
    domainId: number;
    errorCode: string;
  }) {
    this.errors.push(input.errorCode);
  }
}

class FakeProvider {
  hostnames: CloudflareCustomHostname[] = [];
  createCalls = 0;
  getCalls = 0;
  failCreate = false;

  async listCustomHostnames() {
    return this.hostnames;
  }

  async findCustomHostnameByHostname(hostname: string) {
    return this.hostnames.filter((item) => item.hostname === hostname);
  }

  async getCustomHostname(id: string) {
    this.getCalls += 1;
    const found = this.hostnames.find((item) => item.id === id);
    if (!found) throw new Error("not found");
    return found;
  }

  async createCustomHostname(hostname: string) {
    this.createCalls += 1;
    if (this.failCreate) {
      throw new Error("ambiguous create failure");
    }
    const created = {
      id: "cf-created",
      hostname,
      status: "pending",
      sslStatus: "pending_validation",
    };
    this.hostnames.push(created);
    return created;
  }
}

function service(
  repository: FakeRepository,
  provider: FakeProvider,
  limit = 100
) {
  return new CloudflareDomainProvisioningService(
    repository,
    provider,
    limit,
    "customers.shopnest.co.il",
    () => "claim-test-verification-token"
  );
}

test("verified claim creates one Cloudflare hostname and is finalized as consumed", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  const now = new Date("2026-09-22T19:00:00Z");

  const result = await service(repository, provider)
    .provisionVerifiedClaim(
      10,
      20,
      "shop.customer.example",
      now
    );

  assert.equal(result.kind, "provisioned");
  if (result.kind !== "provisioned") return;
  assert.equal(provider.createCalls, 1);
  assert.equal(result.providerHostnameId, "cf-created");
  assert.equal(result.cnameTarget, "customers.shopnest.co.il");
  assert.equal(repository.finalized?.claimConsumedAt, now);
});

test("existing exact Cloudflare hostname is reconciled without duplicate create or quota use", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  provider.hostnames.push({
    id: "cf-existing",
    hostname: "shop.customer.example",
    status: "active",
    sslStatus: "active",
  });

  const result = await service(repository, provider, 1)
    .provisionVerifiedClaim(
      10,
      20,
      "shop.customer.example"
    );

  assert.equal(result.kind, "provisioned");
  assert.equal(provider.createCalls, 0);
  assert.equal(repository.reserveInputs[0]?.needsProviderCreate, false);
  assert.equal(repository.reserveInputs[0]?.providerCount, 0);
});

test("Free-plan quota blocks creation before Cloudflare create", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  provider.hostnames.push({
    id: "used",
    hostname: "already.example",
    status: "active",
    sslStatus: "active",
  });

  await assert.rejects(
    () =>
      service(repository, provider, 1).provisionVerifiedClaim(
        10,
        20,
        "shop.customer.example"
      ),
    (error: unknown) =>
      error instanceof CloudflareDomainProvisioningError &&
      error.code === "PROVIDER_QUOTA_EXHAUSTED"
  );

  assert.equal(provider.createCalls, 0);
  assert.equal(repository.finalized, null);
});

test("active reservation returns in-progress without calling Cloudflare create", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  repository.reservation = {
    kind: "in_progress",
    hostname: "shop.customer.example",
  };

  const result = await service(repository, provider)
    .provisionVerifiedClaim(
      10,
      20,
      "shop.customer.example"
    );

  assert.deepEqual(result, {
    kind: "in_progress",
    hostname: "shop.customer.example",
  });
  assert.equal(provider.createCalls, 0);
  assert.equal(repository.finalized, null);
});

test("provider id on an existing reservation is fetched and never recreated", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  provider.hostnames.push({
    id: "cf-bound",
    hostname: "shop.customer.example",
    status: "pending",
    sslStatus: "pending_validation",
  });
  repository.reservation = {
    kind: "ready",
    claimId: 1,
    domainId: 2,
    hostname: "shop.customer.example",
    tenantId: 3,
    providerHostnameId: "cf-bound",
    claimAlreadyConsumed: false,
  };

  const result = await service(repository, provider)
    .provisionVerifiedClaim(
      10,
      20,
      "shop.customer.example"
    );

  assert.equal(result.kind, "provisioned");
  assert.equal(provider.getCalls, 1);
  assert.equal(provider.createCalls, 0);
});

test("ambiguous create failure reconciles an exact provider hostname before failing", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();

  provider.createCustomHostname = async (hostname: string) => {
    provider.createCalls += 1;
    provider.hostnames.push({
      id: "cf-after-timeout",
      hostname,
      status: "pending",
      sslStatus: "pending_validation",
    });
    throw new Error("network response lost");
  };

  const result = await service(repository, provider)
    .provisionVerifiedClaim(
      10,
      20,
      "shop.customer.example"
    );

  assert.equal(result.kind, "provisioned");
  if (result.kind !== "provisioned") return;
  assert.equal(result.providerHostnameId, "cf-after-timeout");
  assert.equal(provider.createCalls, 1);
});

test("provider mismatch fails closed and records a bounded error code", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  provider.hostnames.push({
    id: "cf-bound",
    hostname: "other.customer.example",
    status: "active",
    sslStatus: "active",
  });
  repository.reservation = {
    kind: "ready",
    claimId: 1,
    domainId: 2,
    hostname: "shop.customer.example",
    tenantId: 3,
    providerHostnameId: "cf-bound",
    claimAlreadyConsumed: false,
  };

  await assert.rejects(() =>
    service(repository, provider).provisionVerifiedClaim(
      10,
      20,
      "shop.customer.example"
    )
  );

  assert.deepEqual(repository.errors, [
    "PROVIDER_HOSTNAME_MISMATCH",
  ]);
  assert.equal(repository.finalized, null);
});
