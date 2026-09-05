import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  startPayment,
  confirmPayment,
  transitionPayment,
} from "../src/lib/payments/core.ts";
import {
  getProvider,
  providerRegistry,
  providerMetadata,
} from "../src/lib/payments/registry.ts";
import {
  encryptCredentials,
  decryptCredentials,
} from "../src/lib/payments/encryption.ts";
import {
  prepareSettings,
  settingsReadModel,
} from "../src/lib/payments/settings.ts";
import {
  PaymentError,
  type PaymentAttempt,
  type PaymentProvider,
  type VerifiedPayment,
} from "../src/lib/payments/types.ts";
import { resolveTenantRoute } from "../src/lib/tenant-routing/core.ts";
import { authorizeTenantAdmin } from "../src/lib/admin-auth/core.ts";
import { MemoryPaymentStore } from "./helpers/payment-store.mts";
import { paymentOwnerKey } from "../src/lib/payments/ownership.ts";
import { checkoutPaymentMessage } from "../src/lib/payments/presentation.ts";

process.env.PAYMENT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
const secret = "test-only-credential-value";
const context = {
  tenant: "gift-shop",
  provider: "cardcom" as const,
  environment: "test" as const,
};
const credentials = { terminalNumber: "12345", apiName: secret };
const config = {
  provider: "cardcom",
  environment: "test",
  enabled: false,
  credentials,
};
const input = {
  orderId: 1,
  ownerKey: "session:buyer",
  publicOrigin: "https://store.example",
  basePath: "/gift-shop",
};
const callback = { body: "signed-by-test-provider", headers: new Headers() };
const source = (path: string) =>
  readFile(new URL(path, import.meta.url), "utf8");
function code(expected: string) {
  return (error: unknown) =>
    error instanceof PaymentError && error.code === expected;
}
function evidence(
  attempt: PaymentAttempt,
  status: VerifiedPayment["status"] = "paid",
): VerifiedPayment {
  return {
    provider: attempt.provider,
    providerTransactionId: attempt.providerTransactionId!,
    externalReference: attempt.externalReference,
    amount: attempt.amount,
    currency: attempt.currency,
    status,
  };
}
function fakeProvider(
  overrides: Partial<PaymentProvider> = {},
): PaymentProvider {
  return {
    createPayment: async () => ({
      providerTransactionId: "provider-test-id",
      redirectUrl: "https://hosted.example/pay",
    }),
    verifyCallback: async ({ body, attempt }) => {
      if (body !== callback.body)
        throw new PaymentError("invalid_confirmation");
      return evidence(attempt);
    },
    getPaymentStatus: async (attempt) => evidence(attempt),
    ...overrides,
  };
}
async function pending(store = new MemoryPaymentStore()) {
  await startPayment(store, input, () => fakeProvider());
  return store;
}

test("registry includes three honest non-live providers and no fake adapter", async () => {
  assert.deepEqual(
    providerRegistry.map((p) => p.id),
    ["cardcom", "pelecard", "tranzila"],
  );
  for (const provider of providerRegistry) {
    assert.equal(provider.live, false);
    assert.equal(provider.capabilities.testConnection, false);
    const adapter = provider.createAdapter({}, "production");
    await assert.rejects(
      adapter.createPayment({
        externalReference: "r",
        amount: 1,
        currency: "ILS",
        callbackUrl: "https://x.example",
        returnUrl: "https://x.example",
      }),
      code("not_implemented"),
    );
    await assert.rejects(
      adapter.getPaymentStatus({} as PaymentAttempt),
      code("not_implemented"),
    );
    await assert.rejects(
      adapter.verifyCallback({ ...callback, attempt: {} as PaymentAttempt }),
      code("not_implemented"),
    );
    assert.equal(adapter.testConnection, undefined);
  }
});
test("unknown provider rejected", () =>
  assert.throws(() => getProvider("untrusted"), code("unknown_provider")));
test("invalid provider environment rejected", () =>
  assert.throws(
    () =>
      prepareSettings({ ...config, provider: "pelecard" }, null, "gift-shop"),
    code("invalid_environment"),
  ));
test("unexpected settings values and schema selectors rejected", () => {
  for (const extra of [
    { schema: "panda_pop" },
    { tenant: "panda-pop" },
    { enabled: "false" },
    { environment: "sandbox" },
  ])
    assert.throws(
      () => prepareSettings({ ...config, ...extra }, null, "gift-shop"),
      code("invalid_settings"),
    );
});
test("Cardcom required fields and field formats are authoritative", () => {
  for (const value of [
    {},
    { terminalNumber: "0", apiName: "x" },
    { ...credentials, extra: "x" },
    { ...credentials, apiName: "" },
    { ...credentials, apiName: "x".repeat(129) },
  ])
    assert.throws(
      () => getProvider("cardcom").validateCredentials(value),
      code("invalid_credentials"),
    );
});
test("AES-GCM encrypted credentials round-trip and are randomized", () => {
  const ciphertext = encryptCredentials(credentials, context);
  assert.equal(ciphertext.includes(secret), false);
  assert.notEqual(ciphertext, JSON.stringify(credentials));
  assert.notEqual(ciphertext, encryptCredentials(credentials, context));
  assert.deepEqual(decryptCredentials(ciphertext, context), credentials);
});
test("tampering, wrong tenant, provider and environment fail authentication", () => {
  const ciphertext = encryptCredentials(credentials, context);
  for (const changed of [
    { ...context, tenant: "panda-pop" },
    { ...context, provider: "tranzila" as const },
    { ...context, environment: "production" as const },
  ])
    assert.throws(
      () => decryptCredentials(ciphertext, changed),
      code("credentials_unavailable"),
    );
  const parts = ciphertext.split(".");
  parts[3] = Buffer.from("tampered").toString("base64");
  assert.throws(
    () => decryptCredentials(parts.join("."), context),
    code("credentials_unavailable"),
  );
});
test("missing or invalid key fails closed without echoing secrets", () => {
  const key = process.env.PAYMENT_ENCRYPTION_KEY;
  try {
    for (const value of [
      undefined,
      "",
      "bad",
      randomBytes(16).toString("base64"),
    ]) {
      if (value === undefined) delete process.env.PAYMENT_ENCRYPTION_KEY;
      else process.env.PAYMENT_ENCRYPTION_KEY = value;
      assert.throws(
        () => encryptCredentials(credentials, context),
        code("encryption_not_configured"),
      );
    }
  } finally {
    process.env.PAYMENT_ENCRYPTION_KEY = key;
  }
});
test("admin payload never includes saved secrets or ciphertext", () => {
  const settings = prepareSettings(config, null, "gift-shop");
  const payload = JSON.stringify({
    settings: settingsReadModel(settings),
    providers: providerMetadata(),
  });
  assert.equal(payload.includes(secret), false);
  assert.equal(payload.includes(settings.encryptedCredentials), false);
  assert.deepEqual(settingsReadModel(settings)?.configuredFields, [
    "terminalNumber",
    "apiName",
  ]);
});
test("replacing a secret works and blank fields preserve only same environment", () => {
  const previous = prepareSettings(config, null, "gift-shop");
  const next = prepareSettings(
    {
      ...config,
      credentials: { terminalNumber: "", apiName: "replacement-test-secret" },
    },
    previous,
    "gift-shop",
  );
  assert.deepEqual(decryptCredentials(next.encryptedCredentials, context), {
    terminalNumber: "12345",
    apiName: "replacement-test-secret",
  });
  assert.throws(
    () =>
      prepareSettings(
        { ...config, environment: "production", credentials: {} },
        previous,
        "gift-shop",
      ),
    code("invalid_credentials"),
  );
});
test("every non-live provider rejects server-side activation", () => {
  for (const provider of providerRegistry)
    assert.throws(
      () => prepareSettings({ ...config, provider: provider.id,
        environment: provider.environments[0], enabled: true }, null, "gift-shop"),
      code("not_implemented"),
    );
});
test("one settings row represents the selected provider", () => {
  const previous = prepareSettings(config, null, "gift-shop");
  const next = prepareSettings(
    {
      provider: "tranzila",
      environment: "production",
      enabled: false,
      credentials: {},
    },
    previous,
    "gift-shop",
  );
  assert.equal(next.provider, "tranzila");
  assert.equal(next.enabled, false);
  assert.deepEqual(next.configuredFields, []);
});
for (const reason of ["not_configured", "disabled"])
  test(`${reason} blocks payment creation without touching inventory`, async () => {
    const store = new MemoryPaymentStore();
    if (reason === "not_configured") store.settings = null;
    else store.settings!.enabled = false;
    await assert.rejects(
      startPayment(store, input, () => fakeProvider()),
      code(reason),
    );
    assert.equal(store.attempts.length, 0);
    assert.equal(store.physical, 10);
  });
test("server order amount is authoritative despite extra client fields", async () => {
  const store = new MemoryPaymentStore();
  let charged = 0;
  await startPayment(
    store,
    { ...input, ...{ amount: 1, currency: "USD" } },
    () =>
      fakeProvider({
        createPayment: async (request) => {
          charged = request.amount;
          assert.equal(request.currency, "ILS");
          return {
            providerTransactionId: "provider-test-id",
            redirectUrl: "https://hosted.example/pay",
          };
        },
      }),
  );
  assert.equal(charged, 250);
  assert.equal(store.order.paymentStatus, "pending");
  assert.equal(store.physical, 10);
});
test("concurrent starts invoke provider once and reuse one attempt", async () => {
  const store = new MemoryPaymentStore();
  let calls = 0;
  const factory = () =>
    fakeProvider({
      createPayment: async () => {
        calls++;
        return {
          providerTransactionId: "provider-test-id",
          redirectUrl: "https://hosted.example/pay",
        };
      },
    });
  await Promise.all(
    Array.from({ length: 5 }, () => startPayment(store, input, factory)),
  );
  assert.equal(calls, 1);
  assert.equal(store.attempts.length, 1);
});
test("ambiguous creation is durable and never reissued", async () => {
  const store = new MemoryPaymentStore();
  let calls = 0;
  const factory = () =>
    fakeProvider({
      createPayment: async () => {
        calls++;
        throw new Error(secret);
      },
    });
  await assert.rejects(
    startPayment(store, input, factory),
    code("creation_unconfirmed"),
  );
  await startPayment(store, input, factory);
  assert.equal(calls, 1);
  assert.equal(store.attempts[0].failureCode, "creation_unconfirmed");
  assert.equal(JSON.stringify(store.attempts).includes(secret), false);
});
test("insecure provider redirect rejected", async () => {
  const store = new MemoryPaymentStore();
  await assert.rejects(
    startPayment(store, input, () =>
      fakeProvider({
        createPayment: async () => ({
          providerTransactionId: "id",
          redirectUrl: "javascript:alert(1)",
        }),
      }),
    ),
    code("creation_unconfirmed"),
  );
  assert.equal(store.attempts[0].redirectUrl, null);
});
test("wrong owner cannot start another customer's order", async () => {
  const store = new MemoryPaymentStore();
  await assert.rejects(
    startPayment(store, { ...input, ownerKey: "session:attacker" }, () =>
      fakeProvider(),
    ),
    code("order_not_found"),
  );
  assert.equal(store.attempts.length, 0);
});
test("invalid callback and fake browser success cannot mark paid", async () => {
  const store = await pending();
  await assert.rejects(
    confirmPayment(
      store,
      store.attempts[0].id,
      { ...callback, body: '{"success":true,"status":"paid"}' },
      () => fakeProvider(),
    ),
    code("invalid_confirmation"),
  );
  assert.equal(store.order.paymentStatus, "pending");
  assert.equal(store.physical, 10);
  const page = await source(
    "../src/app/(customer)/checkout/payment/[id]/page.tsx",
  );
  assert.doesNotMatch(
    page,
    /confirmPayment|processPaymentCallback|markOrderPaid|searchParams/,
  );
});
for (const patch of [
  { amount: 1 },
  { currency: "USD" },
  { providerTransactionId: "wrong" },
  { externalReference: "panda-pop:wrong" },
  { provider: "tranzila" as const },
])
  test(`confirmation binding rejects ${Object.keys(patch)[0]}`, async () => {
    const store = await pending();
    await assert.rejects(
      confirmPayment(store, store.attempts[0].id, callback, () =>
        fakeProvider({
          verifyCallback: async ({ attempt }) => ({
            ...evidence(attempt),
            ...patch,
          }),
        }),
      ),
      code("invalid_confirmation"),
    );
    assert.equal(store.physical, 10);
    assert.equal(store.order.paymentStatus, "pending");
  });
test("valid confirmation consumes central inventory once and marks paid atomically", async () => {
  const store = await pending();
  await Promise.all(
    Array.from({ length: 8 }, () =>
      confirmPayment(store, store.attempts[0].id, callback, () =>
        fakeProvider(),
      ),
    ),
  );
  assert.equal(store.order.paymentStatus, "paid");
  assert.equal(store.physical, 8);
  assert.equal(store.consumed, 1);
  assert.equal(store.reservations[0].state, "consumed");
  assert.equal(store.attempts[0].status, "paid");
  assert.ok(store.attempts[0].confirmedAt);
});
test("failed order write rolls back stock and confirmation", async () => {
  const store = await pending();
  store.failMarkPaid = true;
  await assert.rejects(
    confirmPayment(store, store.attempts[0].id, callback, () => fakeProvider()),
  );
  assert.equal(store.physical, 10);
  assert.equal(store.consumed, 0);
  assert.equal(store.reservations[0].state, "active");
  assert.equal(store.attempts[0].status, "pending");
});
for (const status of ["failed", "cancelled", "expired"] as const)
  test(`${status} releases hold without stock consumption and cannot regress paid`, async () => {
    const store = await pending();
    const failed = () =>
      fakeProvider({
        verifyCallback: async ({ attempt }) => evidence(attempt, status),
      });
    await confirmPayment(store, store.attempts[0].id, callback, failed);
    assert.equal(store.physical, 10);
    assert.equal(store.reservations[0].state, "released");
    assert.equal(store.order.paymentStatus, "pending");
    const paid = await pending();
    await confirmPayment(paid, paid.attempts[0].id, callback, () =>
      fakeProvider(),
    );
    await confirmPayment(paid, paid.attempts[0].id, callback, failed);
    assert.equal(paid.attempts[0].status, "paid");
    assert.equal(paid.physical, 8);
  });
test("expired hold plus verified funds requires review, never stock consumption", async () => {
  const store = await pending();
  store.reservations[0].expiresAt = new Date(0);
  assert.equal(
    await confirmPayment(store, store.attempts[0].id, callback, () =>
      fakeProvider(),
    ),
    "review_required",
  );
  assert.equal(store.physical, 10);
  assert.equal(store.order.paymentStatus, "pending");
});
test("late success after cancellation is review-only", async () => {
  const store = await pending();
  await confirmPayment(store, store.attempts[0].id, callback, () =>
    fakeProvider({
      verifyCallback: async ({ attempt }) => evidence(attempt, "cancelled"),
    }),
  );
  await confirmPayment(store, store.attempts[0].id, callback, () =>
    fakeProvider(),
  );
  assert.equal(store.attempts[0].status, "review_required");
  assert.equal(store.physical, 10);
});
for (const mismatch of ["ownerKey", "cartId", "quantity", "purpose"] as const)
  test(`reservation ${mismatch} mismatch cannot consume`, async () => {
    const store = await pending();
    if (mismatch === "quantity") store.reservations[0].quantity = 3;
    else if (mismatch === "purpose") store.reservations[0].purpose = "cart";
    else store.reservations[0][mismatch] = "wrong";
    await assert.rejects(
      confirmPayment(store, store.attempts[0].id, callback, () =>
        fakeProvider(),
      ),
    );
    assert.equal(store.physical, 10);
    assert.equal(store.attempts[0].status, "pending");
  });
test("gift-shop callbacks cannot lookup or confirm panda-pop orders", async () => {
  const gift = await pending(new MemoryPaymentStore("gift-shop"));
  const panda = await pending(new MemoryPaymentStore("panda-pop"));
  assert.equal(await gift.getAttempt(panda.attempts[0].id), null);
  await assert.rejects(
    confirmPayment(gift, panda.attempts[0].id, callback, () => fakeProvider()),
    code("payment_not_found"),
  );
  await assert.rejects(
    confirmPayment(gift, gift.attempts[0].id, callback, () =>
      fakeProvider({ verifyCallback: async () => evidence(panda.attempts[0]) }),
    ),
    code("invalid_confirmation"),
  );
  assert.equal(panda.physical, 10);
  assert.equal(gift.physical, 10);
});
test("tenant routes and admin authorization prevent cross-tenant settings access", async () => {
  assert.equal(resolveTenantRoute("/gift-shop/admin/payments").kind, "tenant");
  assert.equal(resolveTenantRoute("/unknown/admin/payments").kind, "not-found");
  const authSource = await source("../src/lib/admin-auth/core.ts");
  assert.ok(authSource.includes("authorizeTenantAdmin"));
  assert.equal(authorizeTenantAdmin(null, null), "unauthenticated");
  const principal = {
    id: 1,
    email: "admin@example.test",
    role: "tenant_admin" as const,
    isActive: true,
    tenantSlugs: ["gift-shop"],
  };
  const gift = {
    slug: "gift-shop",
    schemaName: "gift_shop",
    displayName: "Gift",
    status: "active" as const,
  };
  const panda = {
    slug: "panda-pop",
    schemaName: "panda_pop",
    displayName: "Panda",
    status: "active" as const,
  };
  assert.equal(authorizeTenantAdmin(principal, gift), "allowed");
  assert.equal(authorizeTenantAdmin(principal, panda), "forbidden");
  assert.equal(
    authorizeTenantAdmin({ ...principal, tenantSlugs: ["panda-pop"] }, gift),
    "forbidden",
  );
  for (const file of [
    "../src/app/admin/payments/actions.ts",
    "../src/app/admin/payments/page.tsx",
  ])
    assert.match(await source(file), /await requireTenantAdminDb\(\)/);
  const store = await source("../src/lib/payments/drizzle-store.ts");
  assert.match(store, /getDbForTenant\(configured\)/);
  assert.doesNotMatch(store, /controlPlaneDb|getDbForTenant\(null\)/);
  assert.match(store, /configured\.schema !== tenant\.schema/);
});
test("copying settings across tenants cannot decrypt or update them", () => {
  const gift = prepareSettings(config, null, "gift-shop");
  assert.throws(
    () => prepareSettings({ ...config, credentials: {} }, gift, "panda-pop"),
    code("credentials_unavailable"),
  );
});
test("migration enforces singleton, order idempotency and provider-reference uniqueness", async () => {
  const sql = await source(
    "../src/drizzle/migrations/0007_payment_provider_framework.sql",
  );
  for (const name of [
    "payment_settings_singleton",
    "payment_order_unique",
    "payment_provider_transaction_unique",
    "payment_confirmation_required",
  ])
    assert.ok(sql.includes(name));
  assert.doesNotMatch(sql, /DROP TABLE|DROP COLUMN/);
});
test("legacy iCount returns 410 without network or credentials", async () => {
  const route = await source("../src/app/api/iCount/payment/route.ts");
  const retired = await import(
    `data:text/javascript,${encodeURIComponent(route)}`
  );
  assert.equal((await retired.POST()).status, 410);
  assert.doesNotMatch(
    await source("../src/app/api/iCount/payment/route.ts"),
    /fetch\(|process\.env|console\./,
  );
  assert.doesNotMatch(
    await source("../src/app/(customer)/_actions/shipping.ts"),
    /iCountPayment|amount: 1/,
  );
});
test("state transition table rejects reopening a failed payment", () => {
  assert.throws(
    () => transitionPayment("failed", "pending"),
    code("invalid_transition"),
  );
  assert.equal(transitionPayment("paid", "failed"), "paid");
});

for (const changed of ["expired", "cancelled", "amount", "currency"] as const)
  test(`retry rejects a pending payment after ${changed} changes`, async () => {
    const store = await pending();
    if (changed === "expired") store.reservations[0].expiresAt = new Date(0);
    if (changed === "cancelled") store.order.payable = false;
    if (changed === "amount") store.order.amount++;
    if (changed === "currency") store.order.currency = "USD";
    await assert.rejects(startPayment(store, input, () => fakeProvider()));
    assert.equal(store.attempts.length, 1);
    assert.equal(store.physical, 10);
  });

test("reservation expiring during provider creation suppresses the returned link", async () => {
  const store = new MemoryPaymentStore();
  const result = await startPayment(store, input, () => fakeProvider({
    createPayment: async () => {
      store.reservations[0].expiresAt = new Date(0);
      return {providerTransactionId: "provider-test-id", redirectUrl: "https://hosted.example/pay"};
    },
  }));
  assert.equal(result.redirectUrl, null);
  assert.equal(store.attempts[0].providerTransactionId, "provider-test-id");
  assert.equal(store.physical, 10);
});

test("payment ownership never trusts the unsigned legacy user_id cookie", async () => {
  assert.equal(paymentOwnerKey({customerAccountId:null,userId:1,sessionId:null}), null);
  assert.equal(paymentOwnerKey({customerAccountId:null,userId:1,sessionId:"attacker"}), null);
  assert.equal(paymentOwnerKey({customerAccountId:7,userId:null,sessionId:null}), "customer:7");
  assert.equal(paymentOwnerKey({customerAccountId:null,userId:null,sessionId:"buyer"}), "session:buyer");
  for (const path of ["../src/app/(customer)/_actions/checkout.ts", "../src/app/(customer)/checkout/payment/[id]/page.tsx"])
    assert.match(await source(path), /paymentOwnerKey\(/);
});

for (const change of ["disabled", "provider", "environment"] as const)
  test(`pending link cannot resume after settings ${change}`, async () => {
    const store = await pending();
    if (change === "disabled") store.settings!.enabled = false;
    if (change === "provider") store.settings!.provider = "tranzila";
    if (change === "environment") store.settings!.environment = "production";
    await assert.rejects(startPayment(store, input, () => fakeProvider()), code("disabled"));
    assert.equal(store.attempts.length, 1);
  });

for (const mismatch of ["checkoutToken", "consumed"] as const)
  test(`reservation ${mismatch} cannot consume again`, async () => {
    const store = await pending();
    if (mismatch === "checkoutToken") {
      store.reservations[0].checkoutToken = "wrong";
      await assert.rejects(confirmPayment(store, store.attempts[0].id, callback, () => fakeProvider()));
    } else {
      store.reservations[0].state = "consumed";
      assert.equal(await confirmPayment(store, store.attempts[0].id, callback, () => fakeProvider()), "review_required");
    }
    assert.equal(store.physical, 10);
    assert.equal(store.order.paymentStatus, "pending");
  });

test("paid checkout retry reports paid instead of claiming the order is unpaid", async () => {
  const store = await pending();
  await confirmPayment(store, store.attempts[0].id, callback, () => fakeProvider());
  const result = await startPayment(store, input, () => fakeProvider());
  assert.equal(result.status, "paid");
  assert.equal(result.redirectUrl, null);
  assert.equal(checkoutPaymentMessage(result), "statuses.paid");
  assert.equal(store.consumed, 1);
  assert.equal(checkoutPaymentMessage({status:"created",redirectUrl:null}), "paymentUnavailable");
});

test("provider secret fields discourage unrelated saved login autofill", async () => {
  assert.match(await source("../src/app/admin/payments/settings-form.tsx"), /autoComplete=\{field.type === "password" \? "new-password" : "off"\}/);
});
