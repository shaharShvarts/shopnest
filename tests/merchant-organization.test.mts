import assert from "node:assert/strict";
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
