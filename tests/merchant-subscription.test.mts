import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  parsePlanSelection,
  subscriptionStatuses,
  planStatuses,
} from "../src/lib/merchant-subscriptions/core.ts";

test("plan selection strips browser authority fields", () => {
  assert.deepEqual(
    parsePlanSelection({
      planCode: "small",
      organizationId: 999,
      merchantAccountId: 999,
      tenantId: 999,
      schemaName: "public",
      status: "active",
      subscriptionId: 999,
    }),
    { planCode: "small" }
  );
});

test("plan and subscription status sets are explicit", () => {
  assert.deepEqual(planStatuses, ["active", "inactive"]);
  assert.deepEqual(subscriptionStatuses, [
    "pending",
    "trialing",
    "active",
    "past_due",
    "cancelled",
    "expired",
  ]);
});

test("plans/subscriptions migration is additive, constrained, and seeded", async () => {
  const sql = await readFile(
    "src/drizzle/control-migrations/0009_plans_subscriptions.sql",
    "utf8"
  );

  assert.match(sql, /CREATE TYPE "public"."plan_status" AS ENUM\('active', 'inactive'\)/);
  assert.match(sql, /CREATE TYPE "public"."subscription_status" AS ENUM/);
  assert.match(sql, /CREATE TABLE "plans"/);
  assert.match(sql, /CREATE TABLE "subscriptions"/);
  assert.match(sql, /"organization_id" integer NOT NULL/);
  assert.match(sql, /"store_id" integer/);
  assert.match(sql, /"tenant_id" integer/);
  assert.match(sql, /"plan_id" integer NOT NULL/);
  assert.match(sql, /subscriptions_store_id_unique/);
  assert.match(sql, /INSERT INTO public\.plans/);
  assert.match(sql, /ON CONFLICT \("code"\) DO NOTHING/);
  for (const code of ["small", "medium", "large"]) {
    assert.match(sql, new RegExp("'" + code + "'"));
  }
  assert.doesNotMatch(sql, /DROP TABLE|DROP SCHEMA|TRUNCATE/);
});

test("plans/subscriptions migration is journaled after Store onboarding", async () => {
  const journal = JSON.parse(
    await readFile("src/drizzle/control-migrations/meta/_journal.json", "utf8")
  );
  const entry = journal.entries.find(
    (candidate: { tag?: string }) => candidate.tag === "0009_plans_subscriptions"
  );
  assert.ok(entry);
  assert.equal(entry.idx, 9);
  assert.equal(entry.version, "7");
  assert.equal(entry.breakpoints, true);
});

test("subscription repository stays control-plane only and owner scoped", async () => {
  const source = await readFile(
    "src/lib/merchant-subscriptions/drizzle-repository.ts",
    "utf8"
  );

  assert.match(source, /getControlPlaneDb/);
  assert.match(source, /organizationMemberships/);
  assert.match(source, /merchantAccountId/);
  assert.match(source, /"owner"/);
  assert.match(source, /stores\.organizationId/);
  assert.match(source, /plans\.status/);
  assert.match(source, /"active"/);
  assert.match(source, /subscriptions\.storeId/);
  assert.match(source, /\.transaction\(/);
  assert.doesNotMatch(
    source,
    /getDbForTenant|getTenant\(|TENANT_SCHEMA_HEADER|search_path|schemaName.*input/
  );
});

test("legacy tenant plan remains unchanged as compatibility snapshot", async () => {
  const tenant = await readFile(
    "src/drizzle/control-schema/tenant.ts",
    "utf8"
  );
  assert.match(tenant, /tenantPlanEnum\("plan"\)/);
});
