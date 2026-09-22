import assert from "node:assert/strict";
import test from "node:test";
import {
  CLOUDFLARE_SAAS_DEFAULT_FREE_HOSTNAME_LIMIT,
  isCloudflareCustomHostnameReady,
  readCloudflareSaasConfig,
} from "../src/lib/cloudflare-saas/core.ts";
import {
  CloudflareSaasClient,
  CloudflareSaasError,
} from "../src/lib/cloudflare-saas/client.ts";

const ZONE_ID = "78e676c23c38a2be14f646cb211c279f";

test("Cloudflare SaaS config is disabled by default and caps Free plan at 100", () => {
  assert.deepEqual(readCloudflareSaasConfig({}), { enabled: false });

  const config = readCloudflareSaasConfig({
    CLOUDFLARE_SAAS_ENABLED: "true",
    CLOUDFLARE_API_TOKEN: "test-token-not-a-secret",
    CLOUDFLARE_ZONE_ID: ZONE_ID,
    CLOUDFLARE_SAAS_CNAME_TARGET: "customers.shopnest.co.il",
  });

  assert.equal(config.enabled, true);
  if (!config.enabled) return;
  assert.equal(
    config.freeHostnameLimit,
    CLOUDFLARE_SAAS_DEFAULT_FREE_HOSTNAME_LIMIT
  );

  assert.throws(
    () =>
      readCloudflareSaasConfig({
        CLOUDFLARE_SAAS_ENABLED: "true",
        CLOUDFLARE_API_TOKEN: "test-token",
        CLOUDFLARE_ZONE_ID: ZONE_ID,
        CLOUDFLARE_SAAS_CNAME_TARGET: "customers.shopnest.co.il",
        CLOUDFLARE_SAAS_FREE_HOSTNAME_LIMIT: "101",
      }),
    /integer from 1 to 100/
  );
});

test("create custom hostname uses DV HTTP validation and never wildcard", async () => {
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  const client = new CloudflareSaasClient({
    apiToken: "test-token-not-a-secret",
    zoneId: ZONE_ID,
    fetchImpl: (async (url, init) => {
      capturedUrl = String(url);
      capturedInit = init;
      return new Response(
        JSON.stringify({
          success: true,
          result: {
            id: "5bab496f-9b8c-4d52-aded-ec96f947b303",
            hostname: "shop.customer.example",
            status: "pending",
            ssl: { status: "pending_validation" },
          },
        }),
        { status: 200 }
      );
    }) as typeof fetch,
  });

  const hostname = await client.createCustomHostname(
    "shop.customer.example"
  );

  assert.equal(
    capturedUrl,
    `https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/custom_hostnames`
  );
  assert.equal(capturedInit?.method, "POST");

  const headers = new Headers(capturedInit?.headers);
  assert.equal(
    headers.get("Authorization"),
    "Bearer test-token-not-a-secret"
  );

  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    hostname: "shop.customer.example",
    ssl: {
      method: "http",
      type: "dv",
      wildcard: false,
    },
  });

  assert.equal(hostname.status, "pending");
  assert.equal(hostname.sslStatus, "pending_validation");
});

test("exact hostname lookup maps active provider state", async () => {
  const client = new CloudflareSaasClient({
    apiToken: "test-token",
    zoneId: ZONE_ID,
    fetchImpl: (async () =>
      new Response(
        JSON.stringify({
          success: true,
          result: [
            {
              id: "5bab496f-9b8c-4d52-aded-ec96f947b303",
              hostname: "saas-test.shopnest.co.il",
              status: "active",
              ssl: { status: "active" },
            },
          ],
        }),
        { status: 200 }
      )) as typeof fetch,
  });

  const [hostname] = await client.findCustomHostnameByHostname(
    "saas-test.shopnest.co.il"
  );

  assert.ok(hostname);
  assert.equal(hostname.hostname, "saas-test.shopnest.co.il");
  assert.equal(isCloudflareCustomHostnameReady(hostname), true);
});

test("provider errors are normalized without leaking provider messages or token", async () => {
  const token = "super-secret-test-token";
  const client = new CloudflareSaasClient({
    apiToken: token,
    zoneId: ZONE_ID,
    fetchImpl: (async () =>
      new Response(
        JSON.stringify({
          success: false,
          errors: [
            {
              code: 1406,
              message: `raw provider message containing ${token}`,
            },
          ],
          result: null,
        }),
        { status: 403 }
      )) as typeof fetch,
  });

  await assert.rejects(
    () => client.listCustomHostnames(),
    (error: unknown) => {
      assert.ok(error instanceof CloudflareSaasError);
      assert.equal(error.kind, "http_error");
      assert.equal(error.status, 403);
      assert.equal(error.providerCode, "1406");
      assert.doesNotMatch(error.message, /super-secret-test-token/);
      assert.doesNotMatch(error.message, /raw provider message/);
      return true;
    }
  );
});

test("malformed successful provider responses fail closed", async () => {
  const client = new CloudflareSaasClient({
    apiToken: "test-token",
    zoneId: ZONE_ID,
    fetchImpl: (async () =>
      new Response(
        JSON.stringify({
          success: true,
          result: {
            id: "provider-id",
            hostname: "*.customer.example",
            status: "active",
            ssl: { status: "active" },
          },
        }),
        { status: 200 }
      )) as typeof fetch,
  });

  await assert.rejects(
    () => client.getCustomHostname("provider-id"),
    (error: unknown) =>
      error instanceof CloudflareSaasError &&
      error.kind === "malformed_response"
  );
});
