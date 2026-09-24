import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  DOMAIN_REGISTRY_CACHE_TTL_MS,
  DomainRegistryService,
  isPlatformHostname,
  normalizeCustomDomainHostname,
  normalizeRequestHostname,
  trustedDomainFromRegistryRecord,
  type DomainRegistryRecord,
  type DomainRegistryRepository,
} from "../src/lib/domain-registry/core.ts";

class FakeDomainRegistryRepository implements DomainRegistryRepository {
  calls = 0;
  primaryCalls = 0;
  error: Error | null = null;
  record: DomainRegistryRecord | null = null;
  primaryHostname: string | null = null;

  async findActiveByHostname() {
    this.calls += 1;
    if (this.error) {
      const error = this.error;
      this.error = null;
      throw error;
    }
    return this.record;
  }

  async findPrimaryByTenantSlug() {
    this.primaryCalls += 1;
    return this.primaryHostname
      ? { hostname: this.primaryHostname }
      : null;
  }
}

const ACTIVE_RECORD: DomainRegistryRecord = {
  hostname: "store.example",
  domainStatus: "active",
  lifecycleRole: "primary",
  providerHostnameStatus: "active",
  providerSslStatus: "active",
  retireAt: null,
  redirectTargetHostname: null,
  tenant: {
    slug: "panda-pop",
    schemaName: "tenant_42",
    status: "active",
  },
};

test("request Host normalization is exact and strips only transport syntax", () => {
  assert.equal(
    normalizeRequestHostname("Store.Example:443"),
    "store.example"
  );
  assert.equal(
    normalizeRequestHostname("store.example.:443"),
    "store.example"
  );
  assert.equal(
    normalizeRequestHostname("[::1]:3000"),
    "[::1]"
  );
  assert.equal(normalizeRequestHostname("https://store.example"), null);
  assert.equal(normalizeRequestHostname("store.example/path"), null);
  assert.equal(normalizeRequestHostname("user@store.example"), null);
});

test("custom domains require canonical DNS hostnames and reject platform/local identities", () => {
  assert.equal(
    normalizeCustomDomainHostname("WWW.Example.COM:443"),
    "www.example.com"
  );
  assert.equal(
    normalizeCustomDomainHostname("münich.example"),
    "xn--mnich-kva.example"
  );

  for (const value of [
    "localhost",
    "shop",
    "127.0.0.1",
    "[::1]",
    "*.example.com",
    "-bad.example",
    "bad-.example",
    "bad..example",
  ]) {
    assert.equal(normalizeCustomDomainHostname(value), null);
  }

  assert.equal(isPlatformHostname("shopnest.co.il"), true);
  assert.equal(isPlatformHostname("staging.shopnest.co.il"), true);
  assert.equal(isPlatformHostname("localhost:3000"), true);
  assert.equal(isPlatformHostname("127.0.0.1:3001"), true);
  assert.equal(isPlatformHostname("store.example"), false);
});

test("only an active exact domain bound to an active safe Tenant becomes trusted", () => {
  const resolved = trustedDomainFromRegistryRecord(ACTIVE_RECORD);
  assert.ok(resolved);
  assert.equal(resolved.kind, "tenant");
  if (resolved.kind !== "tenant") throw new Error("expected tenant resolution");
  assert.equal(resolved.hostname, "store.example");
  assert.equal(resolved.tenant.slug, "panda-pop");
  assert.equal(resolved.tenant.schema, "tenant_42");

  assert.equal(
    trustedDomainFromRegistryRecord({
      ...ACTIVE_RECORD,
      domainStatus: "verified",
    }),
    null
  );
  assert.equal(
    trustedDomainFromRegistryRecord({
      ...ACTIVE_RECORD,
      tenant: { ...ACTIVE_RECORD.tenant, status: "suspended" },
    }),
    null
  );
  assert.equal(
    trustedDomainFromRegistryRecord({
      ...ACTIVE_RECORD,
      tenant: { ...ACTIVE_RECORD.tenant, schemaName: "public" },
    }),
    null
  );
});

test("domain registry caches positive and negative lookups only for bounded TTL", async () => {
  const repository = new FakeDomainRegistryRepository();
  repository.record = ACTIVE_RECORD;
  const service = new DomainRegistryService(repository);

  const first = await service.resolve("store.example", 1_000);
  repository.record = null;
  const cached = await service.resolve(
    "store.example",
    1_000 + DOMAIN_REGISTRY_CACHE_TTL_MS - 1
  );
  assert.equal(first, cached);
  assert.equal(repository.calls, 1);

  assert.equal(
    await service.resolve(
      "store.example",
      1_000 + DOMAIN_REGISTRY_CACHE_TTL_MS
    ),
    null
  );
  assert.equal(repository.calls, 2);

  assert.equal(
    await service.resolve(
      "store.example",
      1_000 + DOMAIN_REGISTRY_CACHE_TTL_MS + 1
    ),
    null
  );
  assert.equal(repository.calls, 2);
});

test("domain lookup errors fail closed and are not cached as not-found", async () => {
  const repository = new FakeDomainRegistryRepository();
  repository.error = new Error("database unavailable");
  repository.record = ACTIVE_RECORD;
  const service = new DomainRegistryService(repository);

  await assert.rejects(
    () => service.resolve("store.example", 5_000),
    /database unavailable/
  );
  assert.ok(await service.resolve("store.example", 5_000));
  assert.equal(repository.calls, 2);
});

test("invalid custom hosts never reach the domain repository", async () => {
  const repository = new FakeDomainRegistryRepository();
  const service = new DomainRegistryService(repository);

  for (const value of [
    "localhost",
    "127.0.0.1",
    "shop",
    "*.example.com",
    "",
    null,
  ]) {
    assert.equal(await service.resolve(value), null);
  }
  assert.equal(repository.calls, 0);
});

test("trusted Host implementation joins through public Tenants and never derives schema from Host", async () => {
  const [repository, middleware, schema, migration, journal] =
    await Promise.all([
      readFile("src/lib/domain-registry/drizzle-repository.ts", "utf8"),
      readFile("src/middleware.ts", "utf8"),
      readFile("src/drizzle/control-schema/storeDomain.ts", "utf8"),
      readFile(
        "src/drizzle/control-migrations/0012_store_domains.sql",
        "utf8"
      ),
      readFile(
        "src/drizzle/control-migrations/meta/_journal.json",
        "utf8"
      ),
    ]);

  assert.match(repository, /storeDomains/);
  assert.match(repository, /controlPlaneTenants/);
  assert.match(repository, /innerJoin/);
  assert.match(repository, /storeDomains\.status, "active"/);
  assert.match(repository, /controlPlaneTenants\.status, "active"/);

  assert.match(middleware, /resolveTrustedDomain/);
  assert.match(middleware, /isPlatformHostname/);
  assert.match(middleware, /TENANT_ROUTE_MODE_HEADER/);
  assert.match(middleware, /buildHostedTenantRewriteUrl/);
  assert.match(middleware, /Service Unavailable/);
  assert.doesNotMatch(
    middleware,
    /hostname.*schema|schema.*hostname|replace\([^\n]*hostname/
  );

  assert.match(schema, /pgTable\(\s*"store_domains"/);
  assert.match(schema, /verificationToken/);
  assert.match(schema, /verifiedAt/);
  assert.match(schema, /isPrimary/);

  assert.match(migration, /CREATE TABLE IF NOT EXISTS "public"\."store_domains"/);
  assert.match(migration, /store_domains_hostname_unique/);
  assert.match(migration, /store_domains_verified_status_check/);
  assert.doesNotMatch(
    migration,
    /DROP TABLE|DROP SCHEMA|DELETE FROM|TRUNCATE/
  );

  const parsedJournal = JSON.parse(journal);
  const entry = parsedJournal.entries.find(
    (candidate: { tag?: string }) =>
      candidate.tag === "0012_store_domains"
  );
  assert.ok(entry);
  assert.equal(entry.idx, 12);
});


test("candidate domains never become trusted routing identities", () => {
  const result = trustedDomainFromRegistryRecord(
    {
      ...ACTIVE_RECORD,
      lifecycleRole: "candidate",
      providerHostnameStatus: "active",
      providerSslStatus: "active",
      retireAt: null,
      redirectTargetHostname: null,
    } as any,
    Date.now()
  );
  assert.equal(result, null);
});

test("primary and retiring domains resolve to different trusted outcomes", () => {
  const now = new Date("2026-09-23T22:00:00Z").getTime();

  const primary = trustedDomainFromRegistryRecord(
    {
      ...ACTIVE_RECORD,
      lifecycleRole: "primary",
      providerHostnameStatus: "active",
      providerSslStatus: "active",
      retireAt: null,
      redirectTargetHostname: null,
    } as any,
    now
  );
  assert.equal((primary as any)?.kind, "tenant");
  assert.equal((primary as any)?.tenant.slug, "panda-pop");

  const retiring = trustedDomainFromRegistryRecord(
    {
      ...ACTIVE_RECORD,
      lifecycleRole: "retiring",
      providerHostnameStatus: "active",
      providerSslStatus: "active",
      retireAt: new Date("2026-09-24T22:00:00Z"),
      redirectTargetHostname: "new.example.com",
    } as any,
    now
  );
  assert.deepEqual(retiring, {
    kind: "redirect",
    hostname: "store.example",
    targetHostname: "new.example.com",
  });
});

test("expired retiring domains fail closed before lazy cleanup runs", () => {
  const result = trustedDomainFromRegistryRecord(
    {
      ...ACTIVE_RECORD,
      lifecycleRole: "retiring",
      providerHostnameStatus: "active",
      providerSslStatus: "active",
      retireAt: new Date("2026-09-23T22:00:00Z"),
      redirectTargetHostname: "new.example.com",
    } as any,
    new Date("2026-09-23T22:00:00Z").getTime()
  );
  assert.equal(result, null);
});

test("primary custom-domain lookup is cached by tenant slug", async () => {
  const repository = new FakeDomainRegistryRepository();
  repository.primaryHostname = "store.example";
  const service = new DomainRegistryService(repository);

  const first = await (service as any).resolvePrimaryDomainForTenantSlug(
    "panda-pop",
    10_000
  );
  repository.primaryHostname = null;
  const cached = await (service as any).resolvePrimaryDomainForTenantSlug(
    "panda-pop",
    10_000 + DOMAIN_REGISTRY_CACHE_TTL_MS - 1
  );

  assert.equal(first, "store.example");
  assert.equal(cached, "store.example");
  assert.equal(repository.primaryCalls, 1);
});
