import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Google login uses tenant-scoped native navigation instead of Next Link", async () => {
  const source = await readFile(
    "src/app/[tenant]/(storefront)/account/_components/GoogleLoginButton.tsx",
    "utf8"
  );

  assert.match(source, /useTenant\(\)/);
  assert.match(source, /tenant\.path\([\s\S]*\/account\/google\/start/);
  assert.match(source, /<a href=\{href\}>/);
  assert.doesNotMatch(source, /TenantLink/);
  assert.doesNotMatch(source, /from\s+["']next\/link["']/);
});

test("Google callback redirects use the external request origin behind reverse proxies", async () => {
  const source = await readFile(
    "src/app/api/customer-auth/google/callback/route.ts",
    "utf8"
  );

  assert.match(source, /resolveCustomerRequestOrigin/);
  assert.match(source, /const redirectOrigin = resolveRedirectOrigin\(request\)/);
  assert.match(source, /new URL\(destination, redirectOrigin\)/);
  assert.doesNotMatch(source, /new URL\(destination, request\.url\)/);
});
