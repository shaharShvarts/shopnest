import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canMutateOrganization,
  parseOrganizationProfile,
} from "../src/lib/merchant-organizations/core.ts";

test("organization profile requires a nonblank display name and normalizes optional blanks", () => {
  assert.throws(
    () => parseOrganizationProfile({ displayName: "   ", country: "IL" }),
    /invalid_organization_profile/
  );

  assert.deepEqual(
    parseOrganizationProfile({
      displayName: "  Shahar Commerce  ",
      legalName: " ",
      businessNumber: "",
      vatNumber: "  ",
      email: "",
      phone: " ",
      country: "il",
    }),
    {
      displayName: "Shahar Commerce",
      legalName: null,
      businessNumber: null,
      vatNumber: null,
      email: null,
      phone: null,
      country: "IL",
    }
  );
});

test("organization profile rejects malformed email, country, and overlong names", () => {
  for (const input of [
    { displayName: "Business", email: "not-an-email", country: "IL" },
    { displayName: "Business", email: "", country: "ISR" },
    { displayName: "x".repeat(161), email: "", country: "IL" },
  ]) {
    assert.throws(
      () => parseOrganizationProfile(input),
      /invalid_organization_profile/
    );
  }
});

test("organization profile strips browser supplied authority fields", () => {
  const parsed = parseOrganizationProfile({
    displayName: "Business",
    country: "IL",
    merchantAccountId: 999,
    organizationId: 999,
    role: "owner",
  });

  assert.deepEqual(parsed, {
    displayName: "Business",
    legalName: null,
    businessNumber: null,
    vatNumber: null,
    email: null,
    phone: null,
    country: "IL",
  });
});

test("only owner can mutate organizations in PR 36", () => {
  assert.equal(canMutateOrganization("owner"), true);
  assert.equal(canMutateOrganization("admin"), false);
  assert.equal(canMutateOrganization(""), false);
});


test("organization persistence stays control-plane only and first creation is serialized", async () => {
  const source = await readFile(
    "src/lib/merchant-organizations/drizzle-repository.ts",
    "utf8"
  );

  assert.match(source, /getControlPlaneDb/);
  assert.match(source, /\.transaction\(/);
  assert.match(source, /merchantAccounts/);
  assert.match(source, /\.for\("update"\)/);
  assert.match(source, /organizationMemberships/);
  assert.match(source, /role:\s*"owner"/);
  assert.doesNotMatch(
    source,
    /getDbForTenant|getTenant\(|TENANT_SCHEMA_HEADER|sql\.raw|search_path/
  );
});

test("repository update requires owner membership in addition to organization id", async () => {
  const source = await readFile(
    "src/lib/merchant-organizations/drizzle-repository.ts",
    "utf8"
  );

  const updateStart = source.indexOf("updateOwned(");
  assert.ok(updateStart >= 0);
  const updateSource = source.slice(updateStart);
  assert.match(updateSource, /merchantAccountId/);
  assert.match(updateSource, /organizationId/);
  assert.match(updateSource, /role/);
  assert.match(updateSource, /owner/);
});
