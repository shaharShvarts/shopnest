import assert from "node:assert/strict";
import test from "node:test";
import {
  DOMAIN_CLAIM_TTL_MS,
  DOMAIN_CLAIM_VALUE_PREFIX,
  DomainOwnershipClaimService,
  domainClaimDnsName,
  validateClaimHostname,
  type StoreDomainClaimRecord,
  type StoreDomainClaimRepository,
} from "../src/lib/domain-claims/core.ts";

class FakeRepository implements StoreDomainClaimRepository {
  claim: StoreDomainClaimRecord | null = null;
  createCalls = 0;
  verifiedCalls = 0;
  expiredCalls = 0;

  async createPendingForOwnedStore(input: {
    merchantId: number;
    storeId: number;
    hostname: string;
    verificationTokenHash: string;
    expiresAt: Date;
    now: Date;
  }) {
    this.createCalls += 1;
    this.claim = {
      id: 7,
      storeId: input.storeId,
      hostname: input.hostname,
      status: "pending_verification",
      verificationTokenHash: input.verificationTokenHash,
      expiresAt: input.expiresAt,
      verifiedAt: null,
      consumedAt: null,
    };
    return this.claim;
  }

  async findPendingForOwnedStore() {
    return this.claim;
  }

  async markExpired() {
    this.expiredCalls += 1;
    if (this.claim) this.claim = { ...this.claim, status: "expired" };
  }

  async markVerified(input: {
    id: number;
    expectedTokenHash: string;
    now: Date;
  }) {
    this.verifiedCalls += 1;
    if (
      !this.claim ||
      this.claim.id !== input.id ||
      this.claim.verificationTokenHash !== input.expectedTokenHash
    ) {
      return null;
    }
    this.claim = {
      ...this.claim,
      status: "verified",
      verifiedAt: input.now,
    };
    return this.claim;
  }
}

test("domain claim rejects platform hostnames such as shopnest.co.il", () => {
  for (const hostname of [
    "shopnest.co.il",
    "staging.shopnest.co.il",
    "localhost",
    "127.0.0.1",
  ]) {
    assert.throws(
      () => validateClaimHostname(hostname),
      /not allowed/
    );
  }

  assert.equal(
    validateClaimHostname("shop.customer.example"),
    "shop.customer.example"
  );
});

test("starting a claim returns DNS proof but persists only its hash", async () => {
  const repository = new FakeRepository();
  const token = "a".repeat(43);
  const service = new DomainOwnershipClaimService(
    repository,
    { async resolveTxt() { return []; } },
    () => token
  );
  const now = new Date("2026-09-22T16:00:00Z");

  const result = await service.startClaim(
    10,
    20,
    "shop.customer.example",
    now
  );

  assert.equal(result.claimId, 7);
  assert.equal(
    result.dnsName,
    "_shopnest-verification.shop.customer.example"
  );
  assert.equal(
    result.dnsValue,
    `${DOMAIN_CLAIM_VALUE_PREFIX}${token}`
  );
  assert.equal(
    result.expiresAt.getTime(),
    now.getTime() + DOMAIN_CLAIM_TTL_MS
  );
  assert.ok(repository.claim);
  assert.notEqual(repository.claim?.verificationTokenHash, token);
  assert.equal(repository.claim?.verificationTokenHash.length, 64);
});

test("matching DNS TXT proof verifies the claim", async () => {
  const repository = new FakeRepository();
  const token = "b".repeat(43);
  const service = new DomainOwnershipClaimService(
    repository,
    {
      async resolveTxt(name) {
        assert.equal(
          name,
          domainClaimDnsName("shop.customer.example")
        );
        return [[DOMAIN_CLAIM_VALUE_PREFIX, token]];
      },
    },
    () => token
  );
  const now = new Date("2026-09-22T16:00:00Z");

  await service.startClaim(10, 20, "shop.customer.example", now);
  const result = await service.verifyClaim(
    10,
    20,
    "shop.customer.example",
    new Date(now.getTime() + 1_000)
  );

  assert.equal(result.kind, "verified");
  assert.equal(repository.verifiedCalls, 1);
});

test("wrong or missing DNS TXT proof remains pending", async () => {
  const repository = new FakeRepository();
  const token = "c".repeat(43);
  const service = new DomainOwnershipClaimService(
    repository,
    {
      async resolveTxt() {
        return [["shopnest-verification=wrong-token"]];
      },
    },
    () => token
  );
  const now = new Date("2026-09-22T16:00:00Z");

  await service.startClaim(10, 20, "shop.customer.example", now);
  const result = await service.verifyClaim(
    10,
    20,
    "shop.customer.example",
    new Date(now.getTime() + 1_000)
  );

  assert.deepEqual(result, {
    kind: "pending",
    hostname: "shop.customer.example",
  });
  assert.equal(repository.verifiedCalls, 0);
});

test("expired claims cannot verify", async () => {
  const repository = new FakeRepository();
  const token = "d".repeat(43);
  let dnsCalls = 0;
  const service = new DomainOwnershipClaimService(
    repository,
    {
      async resolveTxt() {
        dnsCalls += 1;
        return [[DOMAIN_CLAIM_VALUE_PREFIX + token]];
      },
    },
    () => token
  );
  const now = new Date("2026-09-22T16:00:00Z");

  await service.startClaim(10, 20, "shop.customer.example", now);
  const result = await service.verifyClaim(
    10,
    20,
    "shop.customer.example",
    new Date(now.getTime() + DOMAIN_CLAIM_TTL_MS)
  );

  assert.equal(result.kind, "expired");
  assert.equal(repository.expiredCalls, 1);
  assert.equal(repository.verifiedCalls, 0);
  assert.equal(dnsCalls, 0);
});


test("ownership proof does not require Store provisioning state in the claim service contract", async () => {
  const repository = new FakeRepository();
  const token = "e".repeat(43);
  const service = new DomainOwnershipClaimService(
    repository,
    { async resolveTxt() { return []; } },
    () => token
  );

  const result = await service.startClaim(
    10,
    20,
    "draft-store.customer.example",
    new Date("2026-09-22T16:00:00Z")
  );

  assert.equal(result.hostname, "draft-store.customer.example");
  assert.equal(repository.createCalls, 1);
});


test("domain claim rejects unsupported apex domains", () => {
  for (const hostname of [
    "customer.com",
    "excelapp.co.il",
    "customer.co.uk",
  ]) {
    assert.throws(
      () => validateClaimHostname(hostname),
      /subdomain/
    );
  }

  assert.equal(
    validateClaimHostname("shop.customer.com"),
    "shop.customer.com"
  );
  assert.equal(
    validateClaimHostname("shop.excelapp.co.il"),
    "shop.excelapp.co.il"
  );
});


test("starting a claim rejects a DNS zone apex before creating ownership proof", async () => {
  const repository = new FakeRepository();
  let soaCalls = 0;
  const resolver = {
    async resolveTxt() {
      return [];
    },
    async resolveSoa(name: string) {
      soaCalls += 1;
      assert.equal(name, "customer.uk.com");
      return {
        nsname: "ns1.example.test",
        hostmaster: "hostmaster.example.test",
        serial: 1,
        refresh: 3600,
        retry: 600,
        expire: 86400,
        minttl: 300,
      };
    },
  } as any;

  const service = new DomainOwnershipClaimService(
    repository,
    resolver,
    () => "f".repeat(43)
  );

  await assert.rejects(
    () =>
      service.startClaim(
        10,
        20,
        "customer.uk.com",
        new Date("2026-09-23T13:30:00Z")
      ),
    /apex/
  );

  assert.equal(soaCalls, 1);
  assert.equal(repository.createCalls, 0);
});

test("starting a claim allows a real subdomain when no SOA exists at that hostname", async () => {
  const repository = new FakeRepository();
  const resolver = {
    async resolveTxt() {
      return [];
    },
    async resolveSoa() {
      const error = new Error("no SOA record") as Error & { code?: string };
      error.code = "ENODATA";
      throw error;
    },
  } as any;

  const service = new DomainOwnershipClaimService(
    repository,
    resolver,
    () => "g".repeat(43)
  );

  const result = await service.startClaim(
    10,
    20,
    "shop.customer.uk.com",
    new Date("2026-09-23T13:30:00Z")
  );

  assert.equal(result.hostname, "shop.customer.uk.com");
  assert.equal(repository.createCalls, 1);
});
