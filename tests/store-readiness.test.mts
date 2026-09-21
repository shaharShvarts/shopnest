import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildStoreReadinessResult,
  evaluatePolicies,
  evaluateStoreProfile,
  evaluateSubscription,
  unavailableRequirement,
} from "../src/lib/store-readiness/core.ts";
import {
  parsePolicyDocumentInput,
  requiredPolicyTypesForMarket,
} from "../src/lib/merchant-policies/core.ts";

test("IL Store profile requires legal identity and contact details", () => {
  const complete = evaluateStoreProfile({
    storeDisplayName: "Panda Pop",
    storeSlug: "panda-pop",
    organizationDisplayName: "Panda Ltd",
    legalName: "Panda Pop Ltd",
    businessNumber: "123456789",
    vatNumber: null,
    email: "owner@example.com",
    phone: "0500000000",
    country: "IL",
  });
  assert.equal(complete.status, "complete");

  const incomplete = evaluateStoreProfile({
    storeDisplayName: "Panda Pop",
    storeSlug: "panda-pop",
    organizationDisplayName: "Panda Ltd",
    legalName: null,
    businessNumber: null,
    vatNumber: null,
    email: null,
    phone: null,
    country: "IL",
  });
  assert.equal(incomplete.status, "incomplete");
  assert.equal(incomplete.reason, "organization_profile_incomplete");
});

test("unknown market fails closed", () => {
  const requirement = evaluateStoreProfile({
    storeDisplayName: "Store",
    storeSlug: "store",
    organizationDisplayName: "Business",
    legalName: "Business LLC",
    businessNumber: "123",
    vatNumber: null,
    email: "owner@example.com",
    phone: "123",
    country: "US",
  });
  assert.equal(requirement.status, "unavailable");
  assert.equal(requirement.reason, "market_rules_unavailable");
});

test("subscription requires trusted ownership and an active plan", () => {
  const active = evaluateSubscription({
    storeId: 4,
    organizationId: 1,
    subscription: {
      storeId: 4,
      organizationId: 1,
      tenantId: null,
      status: "pending",
      planStatus: "active",
    },
  });
  assert.equal(active.status, "complete");

  const retired = evaluateSubscription({
    storeId: 4,
    organizationId: 1,
    subscription: {
      storeId: 4,
      organizationId: 1,
      tenantId: null,
      status: "pending",
      planStatus: "inactive",
    },
  });
  assert.equal(retired.status, "incomplete");
  assert.equal(retired.reason, "subscription_plan_inactive");
});

test("IL policies require all configured published policy types", () => {
  const required = requiredPolicyTypesForMarket("IL");
  assert.deepEqual(required, [
    "returns_refunds_cancellation",
    "privacy",
    "terms",
    "shipping_delivery",
  ]);

  const partial = evaluatePolicies(
    required,
    new Set(["privacy", "terms"])
  );
  assert.equal(partial.status, "incomplete");
  assert.deepEqual(partial.details, [
    "returns_refunds_cancellation",
    "shipping_delivery",
  ]);

  const complete = evaluatePolicies(
    required,
    new Set([
      "returns_refunds_cancellation",
      "privacy",
      "terms",
      "shipping_delivery",
    ])
  );
  assert.equal(complete.status, "complete");
});

test("readiness fails closed while blocking onboarding domains are unavailable", () => {
  const result = buildStoreReadinessResult(4, [
    {
      key: "store_profile",
      status: "complete",
      blocking: true,
      reason: "complete",
    },
    unavailableRequirement("shipping"),
    unavailableRequirement("payments"),
    unavailableRequirement("invoicing"),
    {
      key: "policies",
      status: "complete",
      blocking: true,
      reason: "complete",
    },
    unavailableRequirement("products"),
    {
      key: "subscription",
      status: "complete",
      blocking: true,
      reason: "complete",
    },
  ]);

  assert.equal(result.ready, false);
  assert.deepEqual(
    result.requirements.map((requirement) => requirement.key),
    [
      "store_profile",
      "shipping",
      "payments",
      "invoicing",
      "policies",
      "products",
      "subscription",
    ]
  );
});

test("policy input strips browser authority fields", () => {
  assert.deepEqual(
    parsePolicyDocumentInput({
      policyType: "privacy",
      title: "Privacy policy",
      content:
        "This is merchant-authored privacy policy content with enough text to pass the technical completeness threshold for the Store.",
      organizationId: 999,
      storeId: 999,
      market: "US",
      status: "published",
      version: 99,
      tenantId: 999,
      schemaName: "public",
    }),
    {
      policyType: "privacy",
      title: "Privacy policy",
      content:
        "This is merchant-authored privacy policy content with enough text to pass the technical completeness threshold for the Store.",
    }
  );
});

test("policy migration is additive and journaled", async () => {
  const sql = await readFile(
    "src/drizzle/control-migrations/0010_store_policy_documents.sql",
    "utf8"
  );
  assert.match(sql, /CREATE TABLE "store_policy_documents"/);
  assert.match(sql, /store_policy_documents_version_unique/);
  assert.match(sql, /"status" IN \('draft', 'published'\)/);
  assert.doesNotMatch(sql, /DROP TABLE|DROP SCHEMA|TRUNCATE/);

  const journal = JSON.parse(
    await readFile("src/drizzle/control-migrations/meta/_journal.json", "utf8")
  );
  const entry = journal.entries.find(
    (candidate: { tag?: string }) =>
      candidate.tag === "0010_store_policy_documents"
  );
  assert.ok(entry);
  assert.equal(entry.idx, 10);
});

test("readiness only counts the latest policy version as published", async () => {
  const readiness = await readFile(
    "src/lib/store-readiness/drizzle-repository.ts",
    "utf8"
  );

  assert.match(readiness, /desc\(storePolicyDocuments\.version\)/);
  assert.match(readiness, /seenPolicyTypes\.has\(row\.policyType\)/);
  assert.match(readiness, /row\.status === "published"/);
  assert.doesNotMatch(
    readiness,
    /eq\(storePolicyDocuments\.status, "published"\)/
  );
});

test("readiness and policy repositories remain control-plane owner scoped", async () => {
  const [readiness, policies] = await Promise.all([
    readFile("src/lib/store-readiness/drizzle-repository.ts", "utf8"),
    readFile("src/lib/merchant-policies/drizzle-repository.ts", "utf8"),
  ]);

  for (const source of [readiness, policies]) {
    assert.match(source, /getControlPlaneDb/);
    assert.match(source, /organizationMemberships/);
    assert.match(source, /merchantAccountId/);
    assert.match(source, /"owner"/);
    assert.doesNotMatch(
      source,
      /getDbForTenant|getTenant\(|TENANT_SCHEMA_HEADER|search_path|schemaName.*input/
    );
  }
});
