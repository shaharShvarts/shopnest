import assert from "node:assert/strict";
import test from "node:test";
import { cardcomAdapter } from "../src/lib/payments/providers/cardcom-connection.ts";
import { cardcomAmount, cardcomHostedUrl, cardcomChargeId } from "../src/lib/payments/providers/cardcom-hosted.ts";
import { parseCardcomJson } from "../src/lib/payments/providers/cardcom-json.ts";
import { startPayment, confirmPayment } from "../src/lib/payments/core.ts";
import { PaymentError, type PaymentAttempt } from "../src/lib/payments/types.ts";
import { MemoryPaymentStore } from "./helpers/payment-store.mts";
import { randomBytes } from "node:crypto";
import { getProvider, providerMetadata } from "../src/lib/payments/registry.ts";
import { prepareSettings } from "../src/lib/payments/settings.ts";
import { decryptCredentials } from "../src/lib/payments/encryption.ts";
import { paymentActivationAllowed } from "../src/lib/payments/activation.ts";

const credentials = { terminalNumber: "1000", apiName: "synthetic-hosted-user", apiPassword: "synthetic-hosted-password" };
const id = "11111111-2222-4333-8444-555555555555";
const otherId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const url = `https://secure.cardcom.solutions/EA/LPC6/1000/${id}?t=24`;
const input = { externalReference: "gift-shop:attempt", amount: 250, currency: "ILS", returnUrl: "https://shop.example/gift-shop/checkout/payment/attempt", callbackUrl: "https://shop.example/gift-shop/api/payments/attempt/callback" };
const attempt: PaymentAttempt = { id, orderId: 1, provider: "cardcom", environment: "test", encryptedCredentials: "synthetic-snapshot", amount: 250, currency: "ILS", externalReference: input.externalReference, providerTransactionId: id, redirectUrl: url, status: "pending", failureCode: null, confirmedAt: null };
const created = { ResponseCode: 0, LowProfileId: id, Url: url };
function paid(reference = input.externalReference) {
  return { ResponseCode: 0, LowProfileId: id, TerminalNumber: 1000, ReturnValue: reference, Operation: "ChargeOnly", TranzactionId: 123456,
    TranzactionInfo: { ResponseCode: 0, TranzactionId: 123456, TerminalNumber: 1000, Amount: 250, CoinId: 1, IsRefund: false, DealType: "Debit" } };
}
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const adapter = (body: unknown) => cardcomAdapter(credentials, "test", async () => response(body));
const isCode = (code: string) => (error: unknown) => error instanceof PaymentError && error.code === code;

for (const amount of [1, 10, 99, 100, 999, 1000]) test(`major-unit amount ${amount} uses exact decimal JSON`, async () => {
  let calls = 0;
  const provider = cardcomAdapter(credentials, "test", async (endpoint, options) => {
    calls++;
    assert.equal(endpoint, "https://secure.cardcom.solutions/api/v11/LowProfile/Create");
    assert.equal(options?.method, "POST"); assert.equal(options?.redirect, "error"); assert.equal(options?.cache, "no-store");
    assert.ok(options?.signal);
    const body = String(options?.body);
    assert.ok(body.endsWith(`"Amount":${amount}.00}`));
    assert.deepEqual(JSON.parse(body), { TerminalNumber: 1000, ApiName: credentials.apiName, Operation: "ChargeOnly", ReturnValue: input.externalReference, ISOCoinId: 1, SuccessRedirectUrl: input.returnUrl, FailedRedirectUrl: input.returnUrl, CancelRedirectUrl: input.returnUrl, WebHookUrl: input.callbackUrl, Amount: amount });
    assert.equal(body.includes(credentials.apiPassword), false);
    return response(created);
  });
  assert.deepEqual(await provider.createPayment({ ...input, amount }), { providerTransactionId: id, redirectUrl: url });
  assert.equal(calls, 1);
});
for (const amount of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) test(`invalid amount ${amount}`, () => assert.throws(() => cardcomAmount(amount, "ILS")));
test("unsupported currency rejected before network", async () => {
  const provider = cardcomAdapter(credentials, "test", async () => { throw new Error("must not call"); });
  await assert.rejects(provider.createPayment({ ...input, currency: "USD" }), isCode("cardcom_unsupported_currency"));
});
for (const value of ["http://secure.cardcom.solutions/pay", "//secure.cardcom.solutions/pay", "https://evil.example/pay", "https://secure.cardcom.solutions.evil.example/pay", "https://localhost/pay", "https://127.0.0.1/pay", "https://[::1]/pay", "https://user:pass@secure.cardcom.solutions/pay", "https://secure.cardcom.solutions/pay#", "https://secure.cardcom.solutions:444/pay", "https://secure.cardcom.solutions\\@evil.example", " https://secure.cardcom.solutions/pay", "https://secure.cardcom.solutions./pay", "not a url"]) test(`redirect rejected: ${value}`, () => assert.throws(() => cardcomHostedUrl(value)));
for (const body of [{ ResponseCode: 4 }, { ...created, LowProfileId: "bad" }, { ...created, ResponseCode: "0" }, { ...created, Url: "http://evil.example" }, { LowProfileId: id, Url: url }]) test(`creation fails closed ${JSON.stringify(body)}`, async () => { await assert.rejects(adapter(body).createPayment(input)); });
test("production and non-test terminal blocked without network", async () => {
  let calls = 0;
  const network: typeof fetch = async () => { calls++; return response(created); };
  await assert.rejects(cardcomAdapter(credentials, "production", network).createPayment(input), isCode("not_implemented"));
  await assert.rejects(cardcomAdapter({ ...credentials, terminalNumber: "12345" }, "test", network).createPayment(input), isCode("cardcom_test_terminal_required"));
  assert.equal(calls, 0);
});
for (const malformed of ['{"ResponseCode":0,"ResponseCode":1}', '{"ResponseCode":0,"\\u0052esponseCode":1}', '{"x":01}', '{"x":NaN}', '{"x":1,}', '[1,]', '{"x":"bad\ntext"}', '{}garbage', '{', '['.repeat(40) + '0' + ']'.repeat(40)]) test(`strict JSON rejects ${malformed.slice(0, 60)}`, () => assert.throws(() => parseCardcomJson(malformed)));
test("large int64 ID remains exact", async () => {
  const body = JSON.stringify(paid()).replaceAll("123456", "9223372036854775807");
  const parsed = parseCardcomJson(body) as Record<string, unknown>;
  assert.equal(cardcomChargeId(parsed.TranzactionId), "9223372036854775807");
  const provider = cardcomAdapter(credentials, "test", async () => new Response(body, { headers: { "Content-Type": "application/json" } }));
  assert.equal((await provider.getPaymentStatus(attempt)).status, "paid");
  for (const value of ['9223372036854775808', '1.5', '1e3', '0', '-1', '"123456"']) assert.throws(() => cardcomChargeId(parseCardcomJson(value)));
});
test("adjacent unsafe IDs cannot compare equal through rounding", async () => {
  const body = JSON.stringify(paid()).replace('"TranzactionId":123456', '"TranzactionId":9223372036854775806').replace('"TranzactionId":123456', '"TranzactionId":9223372036854775807');
  const provider = cardcomAdapter(credentials, "test", async () => new Response(body, { headers: { "Content-Type": "application/json" } }));
  await assert.rejects(provider.getPaymentStatus(attempt), isCode("invalid_confirmation"));
});
for (const amount of ['250.00', '250.0', '249.99', '250.01', '"250"', '2.5e2', '250.000']) test(`exact status amount token ${amount}`, async () => {
  const body = JSON.stringify(paid()).replace('"Amount":250', `"Amount":${amount}`);
  const provider = cardcomAdapter(credentials, "test", async () => new Response(body, { headers: { "Content-Type": "application/json" } }));
  if (['250.00', '250.0'].includes(amount)) assert.equal((await provider.getPaymentStatus(attempt)).status, "paid");
  else await assert.rejects(provider.getPaymentStatus(attempt));
});
test("authenticated retrieval uses saved reference, not callback claims", async () => {
  const provider = cardcomAdapter(credentials, "test", async (endpoint, options) => {
    assert.equal(endpoint, "https://secure.cardcom.solutions/api/v11/LowProfile/GetLpResult");
    assert.deepEqual(JSON.parse(String(options?.body)), { TerminalNumber: 1000, ApiName: credentials.apiName, LowProfileId: id });
    return response(paid());
  });
  assert.equal((await provider.verifyCallback({ body: JSON.stringify({ LowProfileId: id, Amount: 1, ReturnValue: "forged", ResponseCode: 9 }), headers: new Headers(), attempt })).status, "paid");
});
const corruptions: Array<[string, (body: ReturnType<typeof paid>) => void]> = [
  ["outer terminal", b => { b.TerminalNumber = 123; }], ["inner terminal", b => { b.TranzactionInfo.TerminalNumber = 123; }],
  ["external reference", b => { b.ReturnValue = "other-tenant:attempt"; }], ["profile", b => { b.LowProfileId = otherId; }],
  ["charge ID", b => { b.TranzactionInfo.TranzactionId = 456; }], ["amount", b => { b.TranzactionInfo.Amount = 249; }],
  ["currency", b => { b.TranzactionInfo.CoinId = 2; }], ["refund", b => { b.TranzactionInfo.IsRefund = true; }],
  ["operation", b => { b.Operation = "CreateTokenOnly"; }], ["deal type", b => { b.TranzactionInfo.DealType = "Information"; }],
];
for (const [name, corrupt] of corruptions) test(`successful-looking response rejects wrong ${name}`, async () => {
  const body = paid(); corrupt(body); await assert.rejects(adapter(body).getPaymentStatus(attempt), isCode("invalid_confirmation"));
});
for (const field of ["ResponseCode", "LowProfileId", "TranzactionId", "ReturnValue", "TerminalNumber", "Operation"]) test(`missing ${field} cannot prove paid`, async () => {
  const body: Record<string, unknown> = paid(); delete body[field]; await assert.rejects(adapter(body).getPaymentStatus(attempt));
});
for (const field of ["ResponseCode", "TranzactionId", "Amount", "CoinId", "TerminalNumber", "IsRefund", "DealType"]) test(`missing transaction ${field} cannot prove paid`, async () => {
  const body = paid(); delete (body.TranzactionInfo as Record<string, unknown>)[field]; await assert.rejects(adapter(body).getPaymentStatus(attempt));
});
test("wrong callback reference and environment rejected", async () => {
  let calls = 0;
  const provider = cardcomAdapter(credentials, "test", async () => { calls++; return response(paid()); });
  await assert.rejects(provider.verifyCallback({ attempt, headers: new Headers(), body: JSON.stringify({ LowProfileId: otherId }) }));
  await assert.rejects(provider.getPaymentStatus({ ...attempt, environment: "production" }));
  await assert.rejects(provider.getPaymentStatus({ ...attempt, provider: "tranzila" }));
  assert.equal(calls, 0);
});
for (const kind of ["http", "network", "malformed", "oversized", "content-type", "utf8", "redirect"] as const) test(`network failure ${kind} is normalized`, async () => {
  const provider = cardcomAdapter(credentials, "test", async () => {
    if (kind === "network") throw new Error(credentials.apiPassword);
    if (kind === "http") return new Response(credentials.apiPassword, { status: 500 });
    if (kind === "redirect") { const r = response(created); Object.defineProperty(r, "redirected", { value: true }); return r; }
    return new Response(kind === "oversized" ? "x".repeat(262145) : kind === "utf8" ? new Uint8Array([255]) : "{", { headers: { "Content-Type": kind === "content-type" ? "text/html" : "application/json" } });
  });
  await assert.rejects(provider.createPayment(input), e => e instanceof PaymentError && !e.message.includes(credentials.apiPassword));
});
for (const slowBody of [false, true]) test(`timeout covers ${slowBody ? "body" : "headers"} and aborts`, async () => {
  let signal: AbortSignal | null | undefined;
  const provider = cardcomAdapter(credentials, "test", async (_, options) => {
    signal = options?.signal;
    if (!slowBody) return new Promise<Response>(() => {});
    return new Response(new ReadableStream({ start() {} }), { headers: { "Content-Type": "application/json" } });
  }, 10);
  await assert.rejects(provider.createPayment(input), isCode("cardcom_timeout"));
  assert.equal(signal?.aborted, true);
});

async function setup() {
  const store = new MemoryPaymentStore();
  let status: unknown;
  let creates = 0;
  const provider = cardcomAdapter(credentials, "test", async (endpoint, options) => {
    if (String(endpoint).endsWith("/Create")) {
      creates++; assert.equal(store.attempts.length, 1);
      status = paid(JSON.parse(String(options?.body)).ReturnValue);
      return response(created);
    }
    return typeof status === "string" ? new Response(status, { headers: { "Content-Type": "application/json" } }) : response(status);
  });
  const start = () => startPayment(store, { orderId: 1, ownerKey: "session:buyer", publicOrigin: "https://shop.example", basePath: "/gift-shop" }, () => provider);
  await start();
  const confirm = () => confirmPayment(store, store.attempts[0].id, { body: JSON.stringify({ LowProfileId: id, ResponseCode: 0 }), headers: new Headers() }, () => provider);
  return { store, confirm, start, setStatus: (s: unknown) => { status = s; }, creates: () => creates };
}
for (const state of ["nonzero", "no transaction", "decline", "J2", "J5", "malformed"] as const) test(`unproven ${state} leaves attempt, stock and reservations unchanged`, async () => {
  const fixture = await setup();
  const body = paid(fixture.store.attempts[0].externalReference);
  if (state === "nonzero") body.ResponseCode = 9;
  if (state === "decline") body.TranzactionInfo.ResponseCode = 5;
  if (state === "J2") body.TranzactionInfo.ResponseCode = 700;
  if (state === "J5") body.TranzactionInfo.ResponseCode = 701;
  fixture.setStatus(state === "no transaction" ? { ...body, TranzactionInfo: null } : state === "malformed" ? {} : body);
  const before = structuredClone({ attempts: fixture.store.attempts, order: fixture.store.order, reservations: fixture.store.reservations });
  await assert.rejects(fixture.confirm());
  assert.deepEqual({ attempts: fixture.store.attempts, order: fixture.store.order, reservations: fixture.store.reservations }, before);
  assert.equal(fixture.store.physical, 10);
  await fixture.start(); assert.equal(fixture.creates(), 1);
});
test("concurrent duplicate successful callbacks consume stock once", async () => {
  const fixture = await setup();
  assert.deepEqual(await Promise.all([fixture.confirm(), fixture.confirm()]), ["paid", "paid"]);
  assert.equal(fixture.store.physical, 8); assert.equal(fixture.store.consumed, 1);
  assert.equal(fixture.store.order.paymentStatus, "paid");
});
for (const late of ["expired", "released", "cancelled"] as const) test(`late success after ${late} requires review without fulfilment`, async () => {
  const fixture = await setup();
  if (late === "expired") fixture.store.reservations[0].expiresAt = new Date(0);
  if (late === "released") fixture.store.reservations[0].state = "released";
  if (late === "cancelled") fixture.store.order.payable = false;
  assert.equal(await fixture.confirm(), "review_required");
  assert.equal(fixture.store.physical, 10); assert.equal(fixture.store.order.paymentStatus, "pending");
});
test("forged success cannot turn an unresolved lookup into paid", async () => {
  const fixture = await setup(); fixture.setStatus({ ResponseCode: 8 });
  await assert.rejects(fixture.confirm(), isCode("cardcom_unresolved")); assert.equal(fixture.store.attempts[0].status, "pending");
});
test("ambiguous creation is durable and never retried", async () => {
  const store = new MemoryPaymentStore(); let calls = 0;
  const provider = cardcomAdapter(credentials, "test", async () => { calls++; throw new Error("connection reset"); });
  const start = () => startPayment(store, { orderId: 1, ownerKey: "session:buyer", publicOrigin: "https://shop.example", basePath: "/gift-shop" }, () => provider);
  await assert.rejects(start(), isCode("creation_unconfirmed")); await start();
  assert.equal(calls, 1); assert.equal(store.attempts[0].status, "created"); assert.equal(store.attempts[0].failureCode, "creation_unconfirmed");
});

test("test activation uses encrypted tenant-local credentials and never enables production", () => {
  process.env.PAYMENT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const settings = prepareSettings({ provider: "cardcom", environment: "test", enabled: true, credentials }, null, "gift-shop");
  assert.equal(settings.enabled, true);
  assert.deepEqual(decryptCredentials(settings.encryptedCredentials, { tenant: "gift-shop", provider: "cardcom", environment: "test" }), credentials);
  assert.throws(() => decryptCredentials(settings.encryptedCredentials, { tenant: "panda-pop", provider: "cardcom", environment: "test" }));
  const merged = prepareSettings({ provider: "cardcom", environment: "test", enabled: true, credentials: {} }, settings, "gift-shop");
  assert.equal(merged.enabled, true);
  for (const metadata of providerMetadata()) {
    assert.equal(metadata.live, false);
    assert.equal(paymentActivationAllowed(metadata, "production"), false);
    assert.equal(paymentActivationAllowed(metadata, "test"), metadata.id === "cardcom");
    assert.throws(() => prepareSettings({ provider: metadata.id, environment: "production", enabled: true, credentials }, null, "gift-shop"), isCode("not_implemented"));
  }
});

test("activation rejects non-test terminal including a previously encrypted terminal", () => {
  process.env.PAYMENT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const config = { provider: "cardcom", environment: "test", enabled: false, credentials: { ...credentials, terminalNumber: "12345" } };
  const saved = prepareSettings(config, null, "gift-shop");
  assert.throws(() => prepareSettings({ ...config, enabled: true, credentials: {} }, saved, "gift-shop"), isCode("cardcom_test_terminal_required"));
  assert.throws(() => getProvider("cardcom").assertPaymentConfiguration!(config.credentials, "test"), isCode("cardcom_test_terminal_required"));
});

test("actual Cardcom concurrent starts commit one claim before one network call", async () => {
  const store = new MemoryPaymentStore();
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const called = new Promise<void>(resolve => { entered = resolve; });
  let calls = 0;
  const provider = cardcomAdapter(credentials, "test", async (_endpoint, options) => {
    calls++;
    assert.equal(store.attempts.length, 1);
    assert.equal(store.attempts[0].status, "created");
    const sent = JSON.parse(String(options?.body));
    assert.equal(sent.Amount, store.order.amount);
    assert.equal(sent.ReturnValue, `gift-shop:${store.attempts[0].id}`);
    entered(); await gate; return response(created);
  });
  const start = () => startPayment(store, { orderId: 1, ownerKey: "session:buyer", publicOrigin: "https://shop.example", basePath: "/gift-shop" }, () => provider);
  const first = start(); await called;
  assert.deepEqual(await start(), { status: "created", redirectUrl: null });
  release(); assert.equal((await first).redirectUrl, url);
  assert.equal((await start()).redirectUrl, url);
  assert.equal(calls, 1);
});

test("maximum int64 charge is stored losslessly alongside the unchanged LowProfileId", async () => {
  const fixture = await setup();
  fixture.setStatus(JSON.stringify(paid(fixture.store.attempts[0].externalReference)).replaceAll("123456", "9223372036854775807"));
  assert.equal(await fixture.confirm(), "paid");
  assert.equal(fixture.store.attempts[0].providerChargeId, "9223372036854775807");
  assert.equal(fixture.store.attempts[0].providerTransactionId, id);
  const before = structuredClone(fixture.store.attempts);
  assert.equal(await fixture.confirm(), "paid");
  assert.deepEqual(fixture.store.attempts, before);
  fixture.setStatus(JSON.stringify(paid(fixture.store.attempts[0].externalReference)).replaceAll("123456", "9223372036854775806"));
  await assert.rejects(fixture.confirm(), isCode("invalid_confirmation"));
  assert.deepEqual(fixture.store.attempts, before);
  assert.equal(fixture.store.consumed, 1);
});

test("concurrent conflicting charge evidence cannot replace the committed charge", async () => {
  const fixture = await setup();
  let calls = 0;
  const provider = cardcomAdapter(credentials, "test", async () => {
    const body = paid(fixture.store.attempts[0].externalReference);
    body.TranzactionId = body.TranzactionInfo.TranzactionId = ++calls;
    return response(body);
  });
  const confirm = () => confirmPayment(fixture.store, fixture.store.attempts[0].id, { body: JSON.stringify({ LowProfileId: id }), headers: new Headers() }, () => provider);
  const results = await Promise.allSettled([confirm(), confirm()]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
  assert.equal(fixture.store.consumed, 1);
});

test("Cardcom confirmation rolls back stock, reservation, order and charge ID together", async () => {
  const fixture = await setup();
  const snapshot = () => structuredClone({ attempts: fixture.store.attempts, order: fixture.store.order, physical: fixture.store.physical, reservations: fixture.store.reservations });
  const before = snapshot();
  fixture.store.failMarkPaid = true;
  await assert.rejects(fixture.confirm());
  assert.deepEqual(snapshot(), before);
  fixture.store.failMarkPaid = false;
  assert.equal(await fixture.confirm(), "paid");
  assert.equal(fixture.store.consumed, 1);
  assert.equal(fixture.store.attempts[0].providerChargeId, "123456");
});

for (const field of ["ownerKey", "cartId", "checkoutToken", "items"] as const) test(`Cardcom late success with lost ${field} binding records charge for review only`, async () => {
  const fixture = await setup();
  if (field === "items") fixture.store.order.items[0].quantity = 3;
  else fixture.store.order[field] = "other";
  assert.equal(await fixture.confirm(), "review_required");
  assert.equal(fixture.store.attempts[0].providerChargeId, "123456");
  assert.equal(fixture.store.order.paymentStatus, "pending");
  assert.equal(fixture.store.physical, 10);
  assert.equal(await fixture.confirm(), "review_required");
});

test("another tenant cannot find the attempt or reuse successful evidence", async () => {
  const fixture = await setup();
  const other = new MemoryPaymentStore("panda-pop");
  let calls = 0;
  await assert.rejects(confirmPayment(other, fixture.store.attempts[0].id, { body: "{}", headers: new Headers() }, () => { calls++; throw new Error("unexpected"); }), isCode("payment_not_found"));
  assert.equal(calls, 0);
  fixture.setStatus(paid(`panda-pop:${fixture.store.attempts[0].id}`));
  await assert.rejects(fixture.confirm(), isCode("invalid_confirmation"));
  assert.equal(fixture.store.physical, 10);
});

test("wrong guest owner and unknown order cannot invoke Cardcom", async () => {
  const store = new MemoryPaymentStore(); let calls = 0;
  const provider = cardcomAdapter(credentials, "test", async () => { calls++; return response(created); });
  for (const patch of [{ ownerKey: "session:attacker" }, { orderId: 2 }]) {
    await assert.rejects(startPayment(store, { orderId: 1, ownerKey: "session:buyer", publicOrigin: "https://shop.example", basePath: "/gift-shop", ...patch }, () => provider), isCode("order_not_found"));
  }
  assert.equal(calls, 0); assert.equal(store.attempts.length, 0);
});

test("reservation database failure does not manufacture a review outcome", async () => {
  const fixture = await setup();
  const before = structuredClone(fixture.store.attempts);
  const transaction = fixture.store.transaction.bind(fixture.store);
  const failure = new Error("synthetic database unavailable");
  fixture.store.transaction = callback => transaction(tx => callback({ ...tx, reservationValid: async () => { throw failure; } }));
  await assert.rejects(fixture.confirm(), error => error === failure);
  assert.deepEqual(fixture.store.attempts, before);
  assert.equal(fixture.store.physical, 10);
  assert.equal(fixture.store.order.paymentStatus, "pending");
});
