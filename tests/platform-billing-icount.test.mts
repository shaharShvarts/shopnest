import assert from "node:assert/strict";
import test from "node:test";
import {
  IcountPlatformBillingError,
  IcountPlatformBillingProvider,
  createIcountPlatformBillingProviderFromEnv,
  icountDocumentReferenceFromNotification,
} from "../src/lib/platform-billing/providers/icount.ts";

const checkoutInput = {
  attemptId: 41,
  externalReference: "shopnest-test-reference",
  amountMinor: 12345,
  currency: "ILS",
  billingInterval: "monthly" as const,
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("iCount checkout uses fixed hosted-paypage endpoint, bearer auth and server-authoritative amount", async () => {
  let captured:
    | { url: string; init: RequestInit }
    | undefined;

  const provider = new IcountPlatformBillingProvider(
    {
      apiToken: "test-api-token",
      paypageId: 16,
      timeoutMs: 100,
    },
    async (url, init) => {
      captured = { url: String(url), init: init ?? {} };
      return jsonResponse({
        status: true,
        reason: "OK",
        paypage_id: "16",
        sale_uniqid: "sale-123",
        sale_sid: "session-123",
        sale_url: "https://app.icount.co.il/m/gen/checkout-token",
      });
    }
  );

  const result = await provider.createCheckout(checkoutInput);

  assert.equal(
    captured?.url,
    "https://api.icount.co.il/api/v3.php/paypage/generate_sale"
  );
  assert.equal(captured?.init.method, "POST");
  assert.equal(captured?.init.redirect, "error");
  assert.equal(
    new Headers(captured?.init.headers).get("authorization"),
    "Bearer test-api-token"
  );

  const body = JSON.parse(String(captured?.init.body));
  assert.deepEqual(body, {
    paypage_id: 16,
    sum: 123.45,
    description: "ShopNest platform billing shopnest-test-reference",
    currency_code: "ILS",
    max_payments: 1,
  });
  assert.doesNotMatch(
    JSON.stringify(body),
    /cc_number|cc_cvv|card_number|amountMinor|organizationId|storeId|subscriptionId/
  );

  assert.deepEqual(result, {
    providerReference: "sale:sale-123",
    redirectUrl: "https://app.icount.co.il/m/gen/checkout-token",
    amountMinor: 12345,
    currency: "ILS",
  });
});

test("iCount checkout rejects unsupported currency before making a network call", async () => {
  let calls = 0;
  const provider = new IcountPlatformBillingProvider(
    { apiToken: "test-api-token", paypageId: 16, timeoutMs: 100 },
    async () => {
      calls += 1;
      return jsonResponse({});
    }
  );

  await assert.rejects(
    provider.createCheckout({ ...checkoutInput, currency: "USD" }),
    (error: unknown) =>
      error instanceof IcountPlatformBillingError &&
      error.code === "INVALID_REQUEST"
  );
  assert.equal(calls, 0);
});

test("iCount checkout rejects a redirect URL outside the hosted iCount origin", async () => {
  const provider = new IcountPlatformBillingProvider(
    { apiToken: "test-api-token", paypageId: 16, timeoutMs: 100 },
    async () =>
      jsonResponse({
        status: true,
        reason: "OK",
        sale_uniqid: "sale-123",
        sale_url: "https://evil.example/steal",
      })
  );

  await assert.rejects(
    provider.createCheckout(checkoutInput),
    (error: unknown) =>
      error instanceof IcountPlatformBillingError &&
      error.code === "INVALID_RESPONSE"
  );
});

test("iCount ambiguous checkout timeout is outcome-unknown and never retried", async () => {
  let calls = 0;
  const provider = new IcountPlatformBillingProvider(
    { apiToken: "test-api-token", paypageId: 16, timeoutMs: 5 },
    async (_url, init) => {
      calls += 1;
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new Error("aborted"))
        );
      });
    }
  );

  await assert.rejects(
    provider.createCheckout(checkoutInput),
    (error: unknown) =>
      error instanceof IcountPlatformBillingError &&
      error.code === "OUTCOME_UNKNOWN" &&
      error.outcomeUnknown === true
  );
  assert.equal(calls, 1);
});

test("iCount checkout treats provider 5xx as outcome-unknown", async () => {
  let calls = 0;
  const provider = new IcountPlatformBillingProvider(
    { apiToken: "test-api-token", paypageId: 16, timeoutMs: 100 },
    async () => {
      calls += 1;
      return jsonResponse({ status: false, reason: "server error" }, 503);
    }
  );

  await assert.rejects(
    provider.createCheckout(checkoutInput),
    (error: unknown) =>
      error instanceof IcountPlatformBillingError &&
      error.code === "OUTCOME_UNKNOWN" &&
      error.outcomeUnknown === true
  );
  assert.equal(calls, 1);
});

test("iCount checkout rejects a response for another PayPage", async () => {
  const provider = new IcountPlatformBillingProvider(
    { apiToken: "test-api-token", paypageId: 16, timeoutMs: 100 },
    async () =>
      jsonResponse({
        status: true,
        reason: "OK",
        paypage_id: "99",
        sale_uniqid: "sale-123",
        sale_url: "https://app.icount.co.il/m/gen/checkout-token",
      })
  );

  await assert.rejects(
    provider.createCheckout(checkoutInput),
    (error: unknown) =>
      error instanceof IcountPlatformBillingError &&
      error.code === "INVALID_RESPONSE"
  );
});

test("iCount IPN data is used only to correlate a sale to a document reference", () => {
  const reference = icountDocumentReferenceFromNotification(
    "sale:sale-123",
    {
      sale_uniqid: "sale-123",
      doctype: "invrec",
      docnum: 1001,
      status: "success",
      sum: 1,
      currency_code: "USD",
      confirmation_code: "forged",
    }
  );

  assert.equal(reference, "doc:sale-123:invrec:1001");

  assert.throws(
    () =>
      icountDocumentReferenceFromNotification("sale:sale-123", {
        sale_uniqid: "different-sale",
        doctype: "invrec",
        docnum: 1001,
      }),
    (error: unknown) =>
      error instanceof IcountPlatformBillingError &&
      error.code === "INVALID_NOTIFICATION"
  );
});

test("iCount verification keeps an uncorrelated hosted sale pending without trusting browser return", async () => {
  let calls = 0;
  const provider = new IcountPlatformBillingProvider(
    { apiToken: "test-api-token", paypageId: 16, timeoutMs: 100 },
    async () => {
      calls += 1;
      return jsonResponse({});
    }
  );

  assert.deepEqual(
    await provider.verifyResult({
      providerReference: "sale:sale-123",
      expectedAmountMinor: 12345,
      expectedCurrency: "ILS",
    }),
    {
      providerReference: "sale:sale-123",
      status: "pending",
      amountMinor: 12345,
      currency: "ILS",
    }
  );
  assert.equal(calls, 0);
});

test("iCount verification marks paid only from matching server-to-server document evidence", async () => {
  let capturedBody: unknown;
  const provider = new IcountPlatformBillingProvider(
    { apiToken: "test-api-token", paypageId: 16, timeoutMs: 100 },
    async (url, init) => {
      assert.equal(
        String(url),
        "https://api.icount.co.il/api/v3.php/doc/info"
      );
      capturedBody = JSON.parse(String(init?.body));
      return jsonResponse({
        status: true,
        reason: "OK",
        doc: {
          doctype: "invrec",
          docnum: 1001,
          status: "closed",
          total: 123.45,
          currency_code: "ILS",
          cc_confirmation: "0077456",
        },
      });
    }
  );

  const result = await provider.verifyResult({
    providerReference: "doc:sale-123:invrec:1001",
    expectedAmountMinor: 12345,
    expectedCurrency: "ILS",
  });

  assert.deepEqual(capturedBody, {
    doctype: "invrec",
    docnum: 1001,
    get_payments: true,
  });
  assert.deepEqual(result, {
    providerReference: "doc:sale-123:invrec:1001",
    status: "paid",
    amountMinor: 12345,
    currency: "ILS",
  });
});

test("iCount verification sends amount or currency mismatch to review instead of paid", async () => {
  const provider = new IcountPlatformBillingProvider(
    { apiToken: "test-api-token", paypageId: 16, timeoutMs: 100 },
    async () =>
      jsonResponse({
        status: true,
        reason: "OK",
        doc: {
          doctype: "invrec",
          docnum: 1001,
          status: "closed",
          total: 120,
          currency_code: "ILS",
          cc_confirmation: "0077456",
        },
      })
  );

  assert.deepEqual(
    await provider.verifyResult({
      providerReference: "doc:sale-123:invrec:1001",
      expectedAmountMinor: 12345,
      expectedCurrency: "ILS",
    }),
    {
      providerReference: "doc:sale-123:invrec:1001",
      status: "review_required",
      amountMinor: 12000,
      currency: "ILS",
    }
  );
});

test("iCount production factory requires an explicit server-side token and paypage id", () => {
  assert.throws(
    () => createIcountPlatformBillingProviderFromEnv({}),
    (error: unknown) =>
      error instanceof IcountPlatformBillingError &&
      error.code === "NOT_CONFIGURED"
  );

  const provider = createIcountPlatformBillingProviderFromEnv({
    PLATFORM_BILLING_ICOUNT_API_TOKEN: "server-secret-token",
    PLATFORM_BILLING_ICOUNT_PAYPAGE_ID: "16",
  });

  assert.equal(provider.id, "icount");
});
