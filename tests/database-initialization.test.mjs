import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";
import { resolveDatabaseUrl } from "../src/data/env/database-url.mjs";

function loadModule(path, dependencies, environment = {}) {
  const source = readFileSync(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports,
    process: { env: environment },
    require(name) {
      assert.ok(name in dependencies, `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
  });
  return exports;
}

function database(environment = {}, withTenant = true) {
  const { env } = loadModule("../src/data/env/server.ts", {
    "@t3-oss/env-nextjs": { createEnv },
    zod: { z },
    "./database-url.mjs": { resolveDatabaseUrl },
  }, environment);
  const pools = [];
  const clients = [];
  const tenant = { slug: "gift-shop", schema: "tenant_gift_shop", basePath: "/gift-shop" };
  const exports = loadModule("../src/drizzle/db.ts", {
    "@/data/env/server": { env },
    "drizzle-orm/node-postgres": {
      drizzle(connection, options) {
        const client = { connection, options };
        clients.push(client);
        return client;
      },
    },
    "@/drizzle/schema": {},
    "@/drizzle/control-plane-schema": {},
    pg: { Pool: class { constructor(options) { this.options = options; pools.push(this); } } },
    "@/lib/tenant-context": { getTenant: async () => withTenant ? tenant : null },
    "@/lib/tenant": { resolveConfiguredTenant: slug => slug === tenant.slug ? tenant : null },
  }, environment);
  return { ...exports, pools, clients, tenant };
}

test("route dependency imports need no DB configuration or clients; runtime access fails closed", () => {
  const db = database();
  assert.equal(db.pools.length, 0);
  assert.equal(db.clients.length, 0);
  assert.throws(() => db.getControlPlaneDb(), /DATABASE_URL is required/);
  assert.throws(() => db.getDbForTenant(null), /DATABASE_URL is required/);
  assert.throws(() => db.getDbForTenant(db.tenant), /DATABASE_URL is required/);
  assert.equal(db.pools.length, 0);
  assert.equal(db.clients.length, 0);
});

test("tenantless request database access never falls back to public", async () => {
  const db = database({}, false);
  await assert.rejects(() => db.getDb(), /requires tenant context/);
  assert.equal(db.pools.length, 0);
  assert.equal(db.clients.length, 0);
});

test("runtime clients retain public and tenant search paths and cache pools", async () => {
  const db = database({ DATABASE_URL: "postgresql://test:test@localhost:5432/test" });
  const control = db.getControlPlaneDb();
  assert.equal(db.getControlPlaneDb(), control);
  assert.equal(control.connection.options.options, "-c search_path=public");
  const tenantDb = db.getDbForTenant(db.tenant);
  assert.equal(tenantDb.connection.options.options, "-c search_path=tenant_gift_shop");
  assert.equal((await db.getDb()).connection, tenantDb.connection);
  assert.equal(db.getDbForTenant(db.tenant).connection, tenantDb.connection);
  assert.equal(db.getDbForTenant(null), db.getDbForTenant(null));
  assert.equal(db.pools.length, 2);
});

test("forged tenant contexts are rejected before any client is initialized", () => {
  const db = database();
  for (const tenant of [
    { ...db.tenant, slug: "unknown" },
    { ...db.tenant, schema: "public" },
    { ...db.tenant, basePath: "/another-shop" },
  ]) assert.throws(() => db.getDbForTenant(tenant), /Refusing database access/);
  assert.equal(db.pools.length, 0);
  assert.equal(db.clients.length, 0);
});

test("control-plane operations initialize DB only after runtime authorization", async () => {
  const db = database();
  let authorized = false;
  let databaseRequests = 0;
  const server = loadModule("../src/lib/control-plane/server.ts", {
    "server-only": {},
    "drizzle-orm": {},
    "@/drizzle/control-plane-schema": { controlPlaneTenants: {} },
    "@/drizzle/schema": {},
    "@/drizzle/db": {
      getControlPlaneDb() {
        databaseRequests++;
        return db.getControlPlaneDb();
      },
      getDbForTenant: db.getDbForTenant,
    },
    "@/lib/admin-auth/server": {
      async requireSuperAdmin() {
        if (!authorized) throw new Error("Forbidden");
        return { role: "super_admin" };
      },
    },
    "./core": { authorizeStoreMutation: () => ({ slug: "gift-shop" }) },
  });
  assert.equal(databaseRequests, 0);
  assert.equal(db.pools.length, 0);
  assert.equal(db.clients.length, 0);

  const operations = [
    () => server.listControlPlaneStores(),
    () => server.getControlPlaneStore("gift-shop"),
    () => server.getControlPlaneOverview(),
    () => server.updateControlPlaneStore({ slug: "gift-shop" }),
  ];
  for (const operation of operations) await assert.rejects(operation, /Forbidden/);
  assert.equal(databaseRequests, 0);

  authorized = true;
  for (const operation of operations) {
    await assert.rejects(operation, /DATABASE_URL is required/);
  }
  assert.equal(databaseRequests, operations.length);
  assert.equal(db.pools.length, 0);
  assert.equal(db.clients.length, 0);
});
