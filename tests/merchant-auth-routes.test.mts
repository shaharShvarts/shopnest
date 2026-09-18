import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("merchant signup collects only identity fields and creates a merchant session", async () => {
  const [page, actions] = await Promise.all([
    readFile("src/app/(marketing)/signup/page.tsx", "utf8"),
    readFile("src/app/(marketing)/_actions/merchant-auth.ts", "utf8"),
  ]);
  assert.match(page, /MerchantSignupForm/);
  assert.match(actions, /name:[\s\S]*email:[\s\S]*phone:[\s\S]*password:/);
  assert.match(actions, /registerMerchant/);
  assert.match(actions, /createMerchantSession/);
  assert.match(actions, /MERCHANT_SESSION_COOKIE/);
  assert.match(actions, /redirect\("\/dashboard"\)/);
  assert.doesNotMatch(actions, /schemaName|tenantSlug|organization|subscription|planId|storeSlug/);
});

test("merchant login rotates merchant session and uses generic invalid credentials", async () => {
  const actions = await readFile("src/app/(marketing)/_actions/merchant-auth.ts", "utf8");
  assert.match(actions, /authenticateMerchant/);
  assert.match(
    actions,
    /logoutMerchantToken\([\s\S]*MERCHANT_SESSION_COOKIE[\s\S]*createMerchantSession/
  );
  assert.match(actions, /invalidCredentials/);
  assert.doesNotMatch(actions, /unknownEmail|wrongPassword|accountNotFound/);
});

test("forgot and reset flows do not enumerate accounts or cross auth domains", async () => {
  const actions = await readFile("src/app/(marketing)/_actions/merchant-auth.ts", "utf8");
  assert.match(actions, /requestMerchantPasswordReset/);
  assert.match(actions, /resetMerchantPassword/);
  assert.match(actions, /submitted: true/);
  assert.doesNotMatch(
    actions,
    /getDbForTenant|getTenant\(|customerAccounts|customerSessions|adminUsers|shopnest_customer_session|shopnest_admin_session|sql\.raw/
  );
});

test("merchant logout only invalidates merchant auth", async () => {
  const action = await readFile("src/app/(merchant)/dashboard/_actions.ts", "utf8");
  assert.match(action, /logoutMerchantToken/);
  assert.match(action, /MERCHANT_SESSION_COOKIE/);
  assert.doesNotMatch(action, /CUSTOMER_SESSION_COOKIE|ADMIN_SESSION_COOKIE|logoutCustomer|logoutAdmin/);
});

test("merchant auth pages are accessible forms with password recovery", async () => {
  const [signup, login, forgot, reset, forms] = await Promise.all([
    readFile("src/app/(marketing)/signup/page.tsx", "utf8"),
    readFile("src/app/(marketing)/login/page.tsx", "utf8"),
    readFile("src/app/(marketing)/forgot-password/page.tsx", "utf8"),
    readFile("src/app/(marketing)/reset-password/page.tsx", "utf8"),
    readFile("src/app/(marketing)/_components/MerchantAuthForms.tsx", "utf8"),
  ]);
  assert.match(signup, /MerchantSignupForm/);
  assert.match(login, /MerchantLoginForm/);
  assert.match(forgot, /MerchantForgotPasswordForm/);
  assert.match(reset, /MerchantResetPasswordForm/);
  assert.match(forms, /autoComplete="name"/);
  assert.match(forms, /autoComplete="email"/);
  assert.match(forms, /autoComplete="tel"/);
  assert.match(forms, /autoComplete="new-password"/);
  assert.match(forms, /min-h-11/);
});

test("merchant dashboard is protected by merchant auth only", async () => {
  const page = await readFile("src/app/(merchant)/dashboard/page.tsx", "utf8");
  assert.match(page, /requireMerchantPage\(\)/);
  assert.doesNotMatch(
    page,
    /getTenant\(|getDbForTenant|TenantLink|getCurrentCustomer|getCurrentAdminSession/
  );
});

test("merchant auth translations stay aligned", async () => {
  const [en, he] = await Promise.all([
    readFile("src/messages/en.json", "utf8").then(JSON.parse),
    readFile("src/messages/he.json", "utf8").then(JSON.parse),
  ]);
  assert.deepEqual(
    Object.keys(en.MerchantAuth).sort(),
    Object.keys(he.MerchantAuth).sort()
  );
});
