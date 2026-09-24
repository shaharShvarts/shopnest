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
  preflightError: Error | null = null;
  preflightCalls = 0;
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

  async preflightVerifiedClaim() {
    this.preflightCalls += 1;
    if (this.preflightError) throw this.preflightError;
  }

  async reserveVerifiedClaim(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
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
    "customers.shopnest.co.il"
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


test("unverified or unprovisioned local state blocks all Cloudflare API calls", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();

  let findCalls = 0;
  let listCalls = 0;
  provider.findCustomHostnameByHostname = async () => {
    findCalls += 1;
    return [];
  };
  provider.listCustomHostnames = async () => {
    listCalls += 1;
    return [];
  };

  repository.preflightError = new CloudflareDomainProvisioningError(
    "STORE_NOT_PROVISIONED",
    "Store must be provisioned"
  );

  await assert.rejects(
    () =>
      service(repository, provider).provisionVerifiedClaim(
        10,
        20,
        "shop.customer.example"
      ),
    (error: unknown) =>
      error instanceof CloudflareDomainProvisioningError &&
      error.code === "STORE_NOT_PROVISIONED"
  );

  assert.equal(repository.preflightCalls, 1);
  assert.equal(findCalls, 0);
  assert.equal(listCalls, 0);
  assert.equal(provider.createCalls, 0);
  assert.equal(repository.finalized, null);
});


test("ineligible plan blocks all Cloudflare API calls", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();

  let findCalls = 0;
  let listCalls = 0;
  provider.findCustomHostnameByHostname = async () => {
    findCalls += 1;
    return [];
  };
  provider.listCustomHostnames = async () => {
    listCalls += 1;
    return [];
  };

  repository.preflightError = new CloudflareDomainProvisioningError(
    "CUSTOM_DOMAIN_PLAN_REQUIRED",
    "Custom domains require an active Medium or Large plan"
  );

  await assert.rejects(
    () =>
      service(repository, provider).provisionVerifiedClaim(
        10,
        20,
        "shop.customer.example"
      ),
    (error: unknown) =>
      error instanceof CloudflareDomainProvisioningError &&
      error.code === "CUSTOM_DOMAIN_PLAN_REQUIRED"
  );

  assert.equal(repository.preflightCalls, 1);
  assert.equal(findCalls, 0);
  assert.equal(listCalls, 0);
  assert.equal(provider.createCalls, 0);
  assert.equal(repository.finalized, null);
});


test("quota guard blocks a create when stale provider count is below a newer local finalized binding count", async () => {
  const module = await import("../src/lib/cloudflare-saas/domain-provisioning.ts");
  const evaluateCloudflareQuota = (
    module as typeof module & {
      evaluateCloudflareQuota?: (input: {
        providerCount: number;
        localProviderBoundCount: number;
        pendingReservationCount: number;
        freeHostnameLimit: number;
      }) => boolean;
    }
  ).evaluateCloudflareQuota;

  assert.equal(
    typeof evaluateCloudflareQuota,
    "function",
    "quota decision helper must be available to the locked repository path"
  );

  assert.equal(
    evaluateCloudflareQuota?.({
      providerCount: 99,
      localProviderBoundCount: 100,
      pendingReservationCount: 0,
      freeHostnameLimit: 100,
    }),
    true
  );
});

test("locked quota path uses the local provider-bound count as well as the provider snapshot", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    "src/lib/cloudflare-saas/domain-provisioning-repository.ts",
    "utf8"
  );

  assert.match(source, /localProviderBoundCount/);
  assert.match(source, /evaluateCloudflareQuota/);
});


test("verified ownership without verified direct CNAME blocks all Cloudflare calls", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  let findCalls = 0;
  let listCalls = 0;

  provider.findCustomHostnameByHostname = async () => {
    findCalls += 1;
    return [];
  };
  provider.listCustomHostnames = async () => {
    listCalls += 1;
    return [];
  };

  repository.preflightError = new CloudflareDomainProvisioningError(
    "CNAME_NOT_VERIFIED",
    "Direct ShopNest CNAME verification is required"
  );

  await assert.rejects(
    () =>
      service(repository, provider).provisionVerifiedClaim(
        10,
        20,
        "shop.customer.example"
      ),
    (error: unknown) =>
      error instanceof CloudflareDomainProvisioningError &&
      error.code === "CNAME_NOT_VERIFIED"
  );

  assert.equal(findCalls, 0);
  assert.equal(listCalls, 0);
  assert.equal(provider.createCalls, 0);
  assert.equal(repository.reserveInputs.length, 0);
});

test("provisioning does not create a second plaintext verification secret", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();

  await service(repository, provider).provisionVerifiedClaim(
    10,
    20,
    "shop.customer.example"
  );

  assert.equal(
    Object.prototype.hasOwnProperty.call(
      repository.reserveInputs[0] ?? {},
      "verificationToken"
    ),
    false
  );
});

test("new ShopNest provider bindings are inserted only as non-primary candidates", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(
    "src/lib/cloudflare-saas/domain-provisioning-repository.ts",
    "utf8"
  );

  assert.match(source, /lifecycleRole:\s*"candidate"/);
  assert.match(source, /isPrimary:\s*false/);
  assert.match(source, /cnameVerifiedAt:\s*claim\.cnameVerifiedAt/);
  assert.match(
    source,
    /ne\(storeDomains\.status,\s*"removed"\)/
  );
});
