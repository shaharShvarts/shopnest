import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  billingIntervals,
  parsePlatformBillingSelection,
  platformBillingStatuses,
  type PlatformBillingProvider,
} from "../src/lib/platform-billing/core.ts";

test("platform billing selection accepts only interval and strips browser billing authority", () => {
  assert.deepEqual(
    parsePlatformBillingSelection({
      billingInterval: "annual",
      amountMinor: 1,
      currency: "USD",
      organizationId: 999,
      storeId: 999,
      subscriptionId: 999,
      planId: 999,
      status: "paid",
      providerReference: "forged",
    }),
    { billingInterval: "annual" }
  );
});

test("platform billing interval and lifecycle states are explicit", () => {
  assert.deepEqual(billingIntervals, ["monthly", "annual"]);
  assert.deepEqual(platformBillingStatuses, [
    "created",
    "pending",
    "paid",
    "failed",
    "cancelled",
    "review_required",
  ]);
});

test("platform billing provider contract stays provider agnostic", () => {
  const provider: PlatformBillingProvider = {
    id: "test-provider",
    async createCheckout(input) {
      return {
        providerReference: "ref-1",
        redirectUrl: "https://provider.example/checkout/ref-1",
        amountMinor: input.amountMinor,
        currency: input.currency,
      };
    },
    async verifyResult(input) {
      return {
        providerReference: input.providerReference,
        status: "paid",
        amountMinor: input.expectedAmountMinor,
        currency: input.expectedCurrency,
      };
    },
  };

  assert.equal(provider.id, "test-provider");
  assert.equal(typeof provider.createCheckout, "function");
  assert.equal(typeof provider.verifyResult, "function");
});

test("platform billing schema stores immutable server-authoritative charge snapshots in public", async () => {
  const schema = await readFile(
    "src/drizzle/control-schema/platformBillingAttempt.ts",
    "utf8"
  );

  for (const required of [
    "subscriptionId",
    "organizationId",
    "storeId",
    "planId",
    "billingInterval",
    "currency",
    "amountMinor",
    "status",
  ]) {
    assert.match(schema, new RegExp(required));
  }

  assert.match(schema, /platform_billing_attempts/);
  assert.match(schema, /amount_minor/);
  assert.match(schema, /amount_nonnegative/);
  assert.match(schema, /subscriptions/);
  assert.match(schema, /organizations/);
  assert.match(schema, /stores/);
  assert.match(schema, /plans/);
  assert.doesNotMatch(schema, /tenant schema|search_path|getDbForTenant/i);
});

test("platform billing migration is additive and does not alter tenant payment tables", async () => {
  const sql = await readFile(
    "src/drizzle/control-migrations/0027_platform_billing_foundation.sql",
    "utf8"
  );

  assert.match(sql, /CREATE TYPE "public"."platform_billing_status"/);
  assert.match(sql, /CREATE TABLE "platform_billing_attempts"/);
  assert.match(sql, /"amount_minor" integer NOT NULL/);
  assert.match(sql, /"billing_interval"/);
  assert.match(sql, /"currency"/);
  assert.doesNotMatch(
    sql,
    /payment_provider_settings|payment_transactions|ALTER TABLE "orders"|DROP TABLE|DROP SCHEMA|TRUNCATE/
  );
});

test("platform billing repository derives ownership, subscription and price from control-plane state", async () => {
  const source = await readFile(
    "src/lib/platform-billing/drizzle-repository.ts",
    "utf8"
  );

  assert.match(source, /getControlPlaneDb/);
  assert.match(source, /organizationMemberships/);
  assert.match(source, /merchantAccountId/);
  assert.match(source, /"owner"/);
  assert.match(source, /subscriptions/);
  assert.match(source, /planPrices/);
  assert.match(source, /amountMinor/);
  assert.match(source, /currency/);
  assert.match(source, /transaction/);
  assert.doesNotMatch(
    source,
    /getDbForTenant|payment_provider_settings|payment_transactions|TENANT_SCHEMA_HEADER|search_path/
  );
});


test("platform billing allows only one in-flight attempt per subscription even if price or interval changes", async () => {
  const schema = await readFile(
    "src/drizzle/control-schema/platformBillingAttempt.ts",
    "utf8"
  );
  const migration = await readFile(
    "src/drizzle/control-migrations/0027_platform_billing_foundation.sql",
    "utf8"
  );
  const repository = await readFile(
    "src/lib/platform-billing/drizzle-repository.ts",
    "utf8"
  );

  assert.match(
    schema,
    /platform_billing_attempts_subscription_inflight_unique/
  );
  assert.match(
    migration,
    /platform_billing_attempts_subscription_inflight_unique/
  );
  assert.match(migration, /WHERE "status" IN \('created', 'pending'\)/);

  const existingAttemptBlock = repository.match(
    /const \[existing\][\s\S]*?if \(existing\) return mapAttempt\(existing\);/
  )?.[0];

  assert.ok(existingAttemptBlock);
  assert.match(existingAttemptBlock, /subscriptionId/);
  assert.match(existingAttemptBlock, /\["created", "pending"\]/);
  assert.doesNotMatch(
    existingAttemptBlock,
    /planId|billingInterval|currency|amountMinor/
  );
});
