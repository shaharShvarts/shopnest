import assert from "node:assert/strict";
import test from "node:test";
import {
  assertManagerCapacity,
  generateStoreManagerInvitationToken,
  hashStoreManagerInvitationToken,
  normalizeManagerEmail,
  STORE_MANAGER_INVITATION_TTL_MS,
  StoreTeamError,
  storeManagerQuota,
} from "../src/lib/store-team/core.ts";

test("manager quota supports zero, finite, and unlimited limits", () => {
  assert.deepEqual(storeManagerQuota(0, 0), {
    used: 0,
    limit: 0,
    unlimited: false,
    remaining: 0,
  });
  assert.deepEqual(storeManagerQuota(1, 2), {
    used: 1,
    limit: 2,
    unlimited: false,
    remaining: 1,
  });
  assert.deepEqual(storeManagerQuota(20, -1), {
    used: 20,
    limit: -1,
    unlimited: true,
    remaining: null,
  });
});

test("manager capacity blocks exhausted and over-quota Stores", () => {
  for (const [used, limit] of [[0, 0], [2, 2], [3, 2]]) {
    assert.throws(
      () => assertManagerCapacity(used, limit),
      (error) =>
        error instanceof StoreTeamError &&
        error.code === "MANAGER_LIMIT_REACHED"
    );
  }
  assert.doesNotThrow(() => assertManagerCapacity(1, 2));
  assert.doesNotThrow(() => assertManagerCapacity(999, -1));
});

test("manager email normalization is deterministic", () => {
  assert.equal(normalizeManagerEmail("  Manager@Example.COM "), "manager@example.com");
  assert.throws(() => normalizeManagerEmail("not-an-email"));
});


test("manager invitation tokens are opaque, hashed, and expire after 24 hours", () => {
  const token = generateStoreManagerInvitationToken();
  const hash = hashStoreManagerInvitationToken(token);

  assert.notEqual(token, hash);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(STORE_MANAGER_INVITATION_TTL_MS, 24 * 60 * 60 * 1000);
});
