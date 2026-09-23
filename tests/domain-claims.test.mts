import assert from "node:assert/strict";
import test from "node:test";
import {
  DOMAIN_CLAIM_TTL_MS,
  DOMAIN_CLAIM_VALUE_PREFIX,
  DOMAIN_MANUAL_CHECK_COOLDOWN_MS,
  SHOPNEST_CUSTOM_DOMAIN_CNAME_TARGET,
  DomainOwnershipClaimService,
  domainClaimDnsName,
  validateClaimHostname,
  type StoreDomainClaimRecord,
  type StoreDomainClaimRepository,
} from "../src/lib/domain-claims/core.ts";

function noSoaRecord() {
  const error = new Error("no SOA record") as Error & { code?: string };
  error.code = "ENODATA";
  throw error;
}

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
      cnameVerifiedAt: null,
      lastTxtCheckAt: null,
      lastCnameCheckAt: null,
      consumedAt: null,
    };
    return this.claim;
  }

  async findPendingForOwnedStore() {
    return this.claim;
  }

  async findVerifiedForOwnedStore() {
    return this.claim?.status === "verified" ? this.claim : null;
  }

  async reserveTxtCheck(input: { now: Date }) {
    if (!this.claim) return { kind: "not_found" as const };
    const last = this.claim.lastTxtCheckAt;
    if (
      last &&
      last.getTime() + DOMAIN_MANUAL_CHECK_COOLDOWN_MS > input.now.getTime()
    ) {
      return {
        kind: "cooldown" as const,
        claim: this.claim,
        nextAllowedAt: new Date(
          last.getTime() + DOMAIN_MANUAL_CHECK_COOLDOWN_MS
        ),
      };
    }
    this.claim = { ...this.claim, lastTxtCheckAt: input.now };
    return { kind: "ready" as const, claim: this.claim };
  }

  async reserveCnameCheck(input: { now: Date }) {
    if (!this.claim || this.claim.status !== "verified") {
      return { kind: "not_found" as const };
    }
    const last = this.claim.lastCnameCheckAt;
    if (
      last &&
      last.getTime() + DOMAIN_MANUAL_CHECK_COOLDOWN_MS > input.now.getTime()
    ) {
      return {
        kind: "cooldown" as const,
        claim: this.claim,
        nextAllowedAt: new Date(
          last.getTime() + DOMAIN_MANUAL_CHECK_COOLDOWN_MS
        ),
      };
    }
    this.claim = { ...this.claim, lastCnameCheckAt: input.now };
    return { kind: "ready" as const, claim: this.claim };
  }

  async markCnameVerified(input: { id: number; now: Date }) {
    if (!this.claim || this.claim.id !== input.id) return null;
    this.claim = { ...this.claim, cnameVerifiedAt: input.now };
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
    { async resolveTxt() { return []; }, async resolveCname() { return []; }, async resolveSoa() { return noSoaRecord(); } },
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
      async resolveCname() {
        return [];
      },
      async resolveCname() {
        return [];
      },
      async resolveSoa() {
        return noSoaRecord();
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
      async resolveSoa() {
        return noSoaRecord();
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
      async resolveSoa() {
        return noSoaRecord();
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
    { async resolveTxt() { return []; }, async resolveCname() { return []; }, async resolveSoa() { return noSoaRecord(); } },
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


test("TXT verification reserves a 60-second server cooldown before DNS IO", async () => {
  const repository = new FakeRepository();
  const token = "h".repeat(43);
  let txtLookups = 0;
  const service = new DomainOwnershipClaimService(
    repository,
    {
      async resolveTxt() {
        txtLookups += 1;
        return [];
      },
      async resolveCname() {
        return [];
      },
      async resolveSoa() {
        return noSoaRecord();
      },
    },
    () => token
  );
  const now = new Date("2026-09-23T20:00:00Z");

  await service.startClaim(10, 20, "shop.customer.example", now);
  const first = await service.verifyClaim(
    10,
    20,
    "shop.customer.example",
    new Date(now.getTime() + 1_000)
  );
  const second = await service.verifyClaim(
    10,
    20,
    "shop.customer.example",
    new Date(now.getTime() + 2_000)
  );

  assert.equal(first.kind, "pending");
  assert.equal(second.kind, "cooldown");
  assert.equal(txtLookups, 1);
  if (second.kind === "cooldown") {
    assert.equal(
      second.nextAllowedAt.getTime(),
      now.getTime() + 1_000 + DOMAIN_MANUAL_CHECK_COOLDOWN_MS
    );
  }
});

test("CNAME verification accepts only the single direct ShopNest target", async () => {
  const repository = new FakeRepository();
  const token = "i".repeat(43);
  const now = new Date("2026-09-23T20:10:00Z");
  const service = new DomainOwnershipClaimService(
    repository,
    {
      async resolveTxt() {
        return [[DOMAIN_CLAIM_VALUE_PREFIX + token]];
      },
      async resolveCname() {
        return [SHOPNEST_CUSTOM_DOMAIN_CNAME_TARGET + "."];
      },
      async resolveSoa() {
        return noSoaRecord();
      },
    },
    () => token
  );

  await service.startClaim(10, 20, "shop.customer.example", now);
  await service.verifyClaim(
    10,
    20,
    "shop.customer.example",
    new Date(now.getTime() + 1_000)
  );
  const result = await (service as any).verifyCname(
    10,
    20,
    "shop.customer.example",
    new Date(now.getTime() + 2_000)
  );

  assert.equal(result.kind, "verified");
  assert.ok(repository.claim?.cnameVerifiedAt);
});

test("CNAME verification rejects wrong or ambiguous direct answers", async () => {
  for (const answers of [
    ["edge.customer.example"],
    [SHOPNEST_CUSTOM_DOMAIN_CNAME_TARGET, "unexpected.example"],
  ]) {
    const repository = new FakeRepository();
    const token = "j".repeat(43);
    const now = new Date("2026-09-23T20:20:00Z");
    const service = new DomainOwnershipClaimService(
      repository,
      {
        async resolveTxt() {
          return [[DOMAIN_CLAIM_VALUE_PREFIX + token]];
        },
        async resolveCname() {
          return answers;
        },
        async resolveSoa() {
          return noSoaRecord();
        },
      },
      () => token
    );

    await service.startClaim(10, 20, "shop.customer.example", now);
    await service.verifyClaim(
      10,
      20,
      "shop.customer.example",
      new Date(now.getTime() + 1_000)
    );
    const result = await (service as any).verifyCname(
      10,
      20,
      "shop.customer.example",
      new Date(now.getTime() + 2_000)
    );

    assert.equal(result.kind, "pending");
    assert.equal(repository.claim?.cnameVerifiedAt, null);
  }
});
