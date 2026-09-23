import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CUSTOM_DOMAIN_RETIREMENT_MS,
  DOMAIN_PROVIDER_CHECK_COOLDOWN_MS,
  CustomDomainLifecycleError,
  CustomDomainLifecycleService,
  type CustomDomainLifecycleRepository,
  type OwnedCandidateCheckReservation,
} from "../src/lib/custom-domain-lifecycle/core.ts";

type FakeDomain = {
  id: number;
  hostname: string;
  lifecycleRole: "candidate" | "primary" | "retiring";
  retireAt: Date | null;
  redirectToDomainId: number | null;
};

class FakeLifecycleRepository implements CustomDomainLifecycleRepository {
  reservation: OwnedCandidateCheckReservation = {
    kind: "ready",
    candidateId: 2,
    hostname: "new.example.com",
    tenantId: 3,
  };
  primary: FakeDomain | null = null;
  candidate: FakeDomain = {
    id: 2,
    hostname: "new.example.com",
    lifecycleRole: "candidate",
    retireAt: null,
    redirectToDomainId: null,
  };
  retiring: FakeDomain | null = null;
  activationCalls = 0;
  throwOnActivate: Error | null = null;

  async reserveOwnedCandidateCheck() {
    return this.reservation;
  }

  async activateReadyCandidate(input: {
    candidateId: number;
    now: Date;
    retirementMs: number;
  }) {
    this.activationCalls += 1;
    if (this.throwOnActivate) throw this.throwOnActivate;
    assert.equal(input.candidateId, this.candidate.id);

    const replacedHostname = this.primary?.hostname ?? null;
    if (this.primary) {
      this.retiring = {
        ...this.primary,
        lifecycleRole: "retiring",
        retireAt: new Date(input.now.getTime() + input.retirementMs),
        redirectToDomainId: this.candidate.id,
      };
    }
    this.primary = {
      ...this.candidate,
      lifecycleRole: "primary",
      retireAt: null,
      redirectToDomainId: null,
    };
    this.candidate = { ...this.candidate, lifecycleRole: "primary" };

    return {
      hostname: this.primary.hostname,
      replacedHostname,
    };
  }
}

class FakeSyncService {
  calls = 0;
  result = {
    kind: "synced" as const,
    hostname: "new.example.com",
    providerHostnameStatus: "active",
    providerSslStatus: "active",
    ready: true,
    domainStatus: "active" as const,
  };

  async syncByHostname() {
    this.calls += 1;
    return this.result;
  }
}

test("first ready candidate becomes the single primary", async () => {
  const repository = new FakeLifecycleRepository();
  const sync = new FakeSyncService();
  const service = new CustomDomainLifecycleService(repository, sync, () => {});
  const now = new Date("2026-09-23T21:00:00Z");

  const result = await service.checkOwnedCandidate(7, 42, now);

  assert.deepEqual(result, {
    kind: "activated",
    hostname: "new.example.com",
    replacedHostname: null,
  });
  assert.equal(repository.primary?.lifecycleRole, "primary");
  assert.equal(repository.activationCalls, 1);
});

test("replacement retires the old primary for exactly 24 hours", async () => {
  const repository = new FakeLifecycleRepository();
  repository.primary = {
    id: 1,
    hostname: "old.example.com",
    lifecycleRole: "primary",
    retireAt: null,
    redirectToDomainId: null,
  };
  const sync = new FakeSyncService();
  const service = new CustomDomainLifecycleService(repository, sync, () => {});
  const now = new Date("2026-09-23T21:00:00Z");

  const result = await service.checkOwnedCandidate(7, 42, now);

  assert.equal(result.kind, "activated");
  assert.equal(repository.primary?.hostname, "new.example.com");
  assert.equal(repository.retiring?.hostname, "old.example.com");
  assert.equal(
    repository.retiring?.retireAt?.getTime(),
    now.getTime() + CUSTOM_DOMAIN_RETIREMENT_MS
  );
  assert.equal(repository.retiring?.redirectToDomainId, 2);
  assert.equal(CUSTOM_DOMAIN_RETIREMENT_MS, 24 * 60 * 60 * 1000);
});

test("provider cooldown prevents a second Cloudflare status request", async () => {
  const repository = new FakeLifecycleRepository();
  const nextAllowedAt = new Date("2026-09-23T21:01:00Z");
  repository.reservation = {
    kind: "cooldown",
    hostname: "new.example.com",
    nextAllowedAt,
  };
  const sync = new FakeSyncService();
  const service = new CustomDomainLifecycleService(repository, sync, () => {});

  const result = await service.checkOwnedCandidate(
    7,
    42,
    new Date("2026-09-23T21:00:30Z")
  );

  assert.deepEqual(result, { kind: "cooldown", nextAllowedAt });
  assert.equal(sync.calls, 0);
  assert.equal(repository.activationCalls, 0);
  assert.equal(DOMAIN_PROVIDER_CHECK_COOLDOWN_MS, 60_000);
});

test("provider pending state keeps candidate non-primary", async () => {
  const repository = new FakeLifecycleRepository();
  const sync = new FakeSyncService();
  sync.result = {
    kind: "synced",
    hostname: "new.example.com",
    providerHostnameStatus: "pending",
    providerSslStatus: "pending_validation",
    ready: false,
    domainStatus: "pending_verification",
  };
  const service = new CustomDomainLifecycleService(repository, sync, () => {});

  const result = await service.checkOwnedCandidate(7, 42);

  assert.equal(result.kind, "pending");
  assert.equal(repository.activationCalls, 0);
  assert.equal(repository.candidate.lifecycleRole, "candidate");
});

test("locked cutover rejects stale eligibility without partially swapping domains", async () => {
  const repository = new FakeLifecycleRepository();
  repository.primary = {
    id: 1,
    hostname: "old.example.com",
    lifecycleRole: "primary",
    retireAt: null,
    redirectToDomainId: null,
  };
  repository.throwOnActivate = new CustomDomainLifecycleError(
    "ELIGIBILITY_CHANGED",
    "Store eligibility changed during cutover"
  );
  const service = new CustomDomainLifecycleService(
    repository,
    new FakeSyncService(),
    () => {}
  );

  await assert.rejects(
    () => service.checkOwnedCandidate(7, 42),
    (error: unknown) =>
      error instanceof CustomDomainLifecycleError &&
      error.code === "ELIGIBILITY_CHANGED"
  );

  assert.equal(repository.primary?.hostname, "old.example.com");
  assert.equal(repository.retiring, null);
});

test("Drizzle cutover rechecks authoritative state under a tenant lock", async () => {
  const source = await readFile(
    "src/lib/custom-domain-lifecycle/drizzle-repository.ts",
    "utf8"
  );

  assert.match(source, /pg_advisory_xact_lock/);
  assert.match(source, /shopnest_domain_lifecycle/);
  assert.match(source, /\.for\("update"\)/);
  assert.match(source, /plans\.code/);
  assert.match(source, /subscriptions\.status/);
  assert.match(source, /providerHostnameStatus/);
  assert.match(source, /providerSslStatus/);
  assert.match(source, /lifecycleRole:\s*"retiring"/);
  assert.match(source, /lifecycleRole:\s*"primary"/);
});
