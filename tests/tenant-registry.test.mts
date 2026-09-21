import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  TENANT_REGISTRY_CACHE_TTL_MS,
  TenantRegistryService,
  isSafeTenantSchemaName,
  isTrustedTenant,
  trustedTenantFromRegistryRecord,
  type TenantRegistryRecord,
  type TenantRegistryRepository,
} from "../src/lib/tenant-registry/core.ts";

class FakeTenantRegistryRepository implements TenantRegistryRepository {
  calls = 0;
  error: Error | null = null;
  record: TenantRegistryRecord | null = null;

  async findActiveBySlug() {
    this.calls += 1;
    if (this.error) {
      const error = this.error;
      this.error = null;
      throw error;
    }
    return this.record;
  }
}

test("trusted registry record supplies canonical DB schema without deriving it from the request slug", () => {
  const tenant = trustedTenantFromRegistryRecord({
    slug: "panda-pop",
    schemaName: "merchant_42",
    status: "active",
  });

  assert.ok(tenant);
  assert.equal(tenant.slug, "panda-pop");
  assert.equal(tenant.schema, "merchant_42");
  assert.equal(tenant.basePath, "/panda-pop");
  assert.equal(isTrustedTenant(tenant), true);
  assert.equal(
    isTrustedTenant({
      slug: "panda-pop",
      schema: "merchant_42",
      basePath: "/panda-pop",
    }),
    false
  );
});

test("inactive, malformed, and unsafe registry rows fail closed", () => {
  for (const status of ["suspended", "disabled"] as const) {
    assert.equal(
      trustedTenantFromRegistryRecord({
        slug: "panda-pop",
        schemaName: "panda_pop",
        status,
      }),
      null
    );
  }

  for (const record of [
    {
      slug: "Panda-Pop",
      schemaName: "panda_pop",
      status: "active" as const,
    },
    {
      slug: "panda-pop",
      schemaName: "public",
      status: "active" as const,
    },
    {
      slug: "panda-pop",
      schemaName: "pg_catalog",
      status: "active" as const,
    },
    {
      slug: "panda-pop",
      schemaName: "Bad-Schema",
      status: "active" as const,
    },
  ]) {
    assert.equal(trustedTenantFromRegistryRecord(record), null);
  }

  assert.equal(isSafeTenantSchemaName("tenant_1"), true);
  assert.equal(isSafeTenantSchemaName("information_schema"), false);
});

test("registry caches positive and negative lookups only for the bounded TTL", async () => {
  const repository = new FakeTenantRegistryRepository();
  repository.record = {
    slug: "panda-pop",
    schemaName: "panda_pop",
    status: "active",
  };
  const service = new TenantRegistryService(repository);

  const first = await service.resolve("panda-pop", 1_000);
  repository.record = null;
  const cached = await service.resolve(
    "panda-pop",
    1_000 + TENANT_REGISTRY_CACHE_TTL_MS - 1
  );
  assert.equal(first, cached);
  assert.equal(repository.calls, 1);

  assert.equal(
    await service.resolve(
      "panda-pop",
      1_000 + TENANT_REGISTRY_CACHE_TTL_MS
    ),
    null
  );
  assert.equal(repository.calls, 2);

  assert.equal(
    await service.resolve(
      "panda-pop",
      1_000 + TENANT_REGISTRY_CACHE_TTL_MS + 1
    ),
    null
  );
  assert.equal(repository.calls, 2);
});

test("lookup errors fail closed and are not cached as not-found", async () => {
  const repository = new FakeTenantRegistryRepository();
  repository.error = new Error("database unavailable");
  repository.record = {
    slug: "panda-pop",
    schemaName: "panda_pop",
    status: "active",
  };
  const service = new TenantRegistryService(repository);

  await assert.rejects(
    () => service.resolve("panda-pop", 5_000),
    /database unavailable/
  );
  const tenant = await service.resolve("panda-pop", 5_000);
  assert.ok(tenant);
  assert.equal(repository.calls, 2);
});

test("invalid request slug never reaches the registry repository", async () => {
  const repository = new FakeTenantRegistryRepository();
  const service = new TenantRegistryService(repository);

  for (const value of [
    "Panda Pop",
    "../public",
    "panda_pop",
    "",
    null,
  ]) {
    assert.equal(await service.resolve(value), null);
  }
  assert.equal(repository.calls, 0);
});

test("runtime tenant resolution is DB-backed and fails closed across trust boundaries", async () => {
  const [repository, middleware, context, database, clientContext] =
    await Promise.all([
      readFile(
        "src/lib/tenant-registry/drizzle-repository.ts",
        "utf8"
      ),
      readFile("src/middleware.ts", "utf8"),
      readFile("src/lib/tenant-context.ts", "utf8"),
      readFile("src/drizzle/db.ts", "utf8"),
      readFile("src/context/TenantContext.tsx", "utf8"),
    ]);

  assert.match(repository, /getControlPlaneDb/);
  assert.match(repository, /controlPlaneTenants\.slug/);
  assert.match(repository, /controlPlaneTenants\.status/);
  assert.match(repository, /"active"/);

  assert.match(middleware, /resolveTrustedTenant/);
  assert.match(middleware, /resolveTenantRouteAsync/);
  assert.match(middleware, /runtime:\s*"nodejs"/);
  assert.match(middleware, /Service Unavailable/);

  assert.match(context, /await resolveTrustedTenant\(slug\)/);
  assert.match(context, /schema !== tenant\.schema/);
  assert.doesNotMatch(context, /resolveConfiguredTenant/);

  assert.match(database, /isTrustedTenant\(tenant\)/);
  assert.doesNotMatch(database, /resolveConfiguredTenant/);

  assert.match(clientContext, /normalizeTenantSlug/);
  assert.doesNotMatch(clientContext, /resolveConfiguredTenant/);
});
