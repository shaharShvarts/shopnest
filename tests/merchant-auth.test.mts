import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("merchant identity uses dedicated control-plane tables", async () => {
  const schema = await readFile("src/drizzle/control-plane-schema.ts", "utf8");
  assert.match(schema, /merchantAccount/);
  assert.match(schema, /merchantSession/);
  assert.match(schema, /merchantPasswordReset/);
});

test("merchant migration is additive and keeps phone non-unique", async () => {
  const sql = await readFile(
    "src/drizzle/control-migrations/0006_merchant_identity.sql",
    "utf8"
  );
  assert.match(sql, /CREATE TABLE "merchant_accounts"/);
  assert.match(sql, /CREATE TABLE "merchant_sessions"/);
  assert.match(sql, /CREATE TABLE "merchant_password_reset_tokens"/);
  assert.match(sql, /email_normalized[\s\S]*UNIQUE/);
  assert.doesNotMatch(sql, /UNIQUE[\s\S]*phone_e164|phone_e164[\s\S]*UNIQUE/);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM/);
  assert.match(sql, /merchant_sessions[\s\S]*REFERENCES "public"\."merchant_accounts"\("id"\) ON DELETE cascade/);
  assert.match(sql, /merchant_password_reset_tokens[\s\S]*REFERENCES "public"\."merchant_accounts"\("id"\) ON DELETE cascade/);
  assert.doesNotMatch(sql, /tenant_|schema_name|search_path/);
});

test("merchant schema keeps phone nullable and email normalized unique", async () => {
  const account = await readFile("src/drizzle/control-schema/merchantAccount.ts", "utf8");
  assert.match(account, /emailNormalized:[\s\S]*\.notNull\(\)[\s\S]*\.unique\(\)/);
  assert.match(account, /phoneE164: varchar\("phone_e164"/);
  assert.doesNotMatch(account, /phoneE164:[\s\S]{0,120}\.unique\(\)/);
});
