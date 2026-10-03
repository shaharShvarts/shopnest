import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("merchant signup collects identity only and sends a verification link", async () => {
  const [page, forms, actions] = await Promise.all([
    readFile("src/app/(marketing)/signup/page.tsx", "utf8"),
    readFile("src/app/(marketing)/_components/MerchantAuthForms.tsx", "utf8"),
    readFile("src/app/(marketing)/_actions/merchant-auth.ts", "utf8"),
  ]);

  assert.match(page, /MerchantSignupForm/);
  assert.match(actions, /beginMerchantSignup/);
  assert.match(actions, /createMerchantSignupDelivery/);
  assert.match(actions, /\/complete-signup\?token=/);

  const signupSchema = actions.slice(
    actions.indexOf("const signupSchema"),
    actions.indexOf("const loginSchema")
  );
  assert.match(signupSchema, /name:[\s\S]*email:[\s\S]*phone:/);
  assert.doesNotMatch(signupSchema, /password/);
  assert.doesNotMatch(
    signupSchema,
    /schemaName|tenantSlug|organization|subscription|planId|storeSlug/
  );

  const signupForm = forms.slice(
    forms.indexOf("export function MerchantSignupForm"),
    forms.indexOf("export function MerchantCompleteSignupForm")
  );
  assert.match(signupForm, /merchant-signup-name/);
  assert.match(signupForm, /merchant-signup-email/);
  assert.match(signupForm, /merchant-signup-phone/);
  assert.doesNotMatch(signupForm, /type="password"/);
});

test("merchant signup completion sets password and creates the authenticated session", async () => {
  const [page, forms, actions] = await Promise.all([
    readFile("src/app/(marketing)/complete-signup/page.tsx", "utf8"),
    readFile("src/app/(marketing)/_components/MerchantAuthForms.tsx", "utf8"),
    readFile("src/app/(marketing)/_actions/merchant-auth.ts", "utf8"),
  ]);

  assert.match(page, /inspectMerchantSignupToken/);
  assert.match(page, /MerchantCompleteSignupForm/);
  assert.match(page, /MerchantSignupResendForm/);
  assert.match(page, /state\.kind === "completed"/);
  assert.match(page, /current\?\.id === state\.merchantId/);
  assert.match(page, /redirect\("\/dashboard"\)/);
  assert.match(page, /redirect\("\/login"\)/);

  assert.match(forms, /name="password"/);
  assert.match(forms, /name="passwordConfirmation"/);
  assert.match(actions, /completeMerchantSignup/);
  assert.match(actions, /createMerchantSession/);
  assert.match(actions, /setMerchantSessionCookie/);
  assert.match(actions, /resendMerchantSignupVerification/);
});

test("shared login authenticates Owner first and then an eligible Manager", async () => {
  const actions = await readFile("src/app/(marketing)/_actions/merchant-auth.ts", "utf8");
  assert.match(actions, /authenticateMerchant/);
  assert.match(actions, /authenticateAdmin/);
  assert.match(actions, /admin\.role !== "tenant_admin"/);
  assert.match(actions, /managerPrincipal\.tenantSlugs\.length > 0/);
  assert.match(actions, /listManagedStores\(admin\.id\)/);
  assert.match(actions, /createMerchantSession/);
  assert.match(actions, /createAdminSession/);
  assert.match(actions, /ADMIN_SESSION_COOKIE/);
  assert.match(actions, /MERCHANT_SESSION_COOKIE/);
  assert.match(actions, /invalidCredentials/);
  assert.doesNotMatch(actions, /unknownEmail|wrongPassword|accountNotFound/);
});

test("forgot and reset remain Merchant password flows without tenant or customer authority", async () => {
  const actions = await readFile("src/app/(marketing)/_actions/merchant-auth.ts", "utf8");
  assert.match(actions, /requestMerchantPasswordReset/);
  assert.match(actions, /resetMerchantPassword/);
  assert.match(actions, /submitted: true/);
  assert.doesNotMatch(
    actions,
    /getDbForTenant|getTenant\(|customerAccounts|customerSessions|shopnest_customer_session|sql\.raw/
  );
});

test("dashboard logout invalidates both Owner and Manager workspace sessions", async () => {
  const action = await readFile("src/app/(merchant)/dashboard/_actions.ts", "utf8");
  assert.match(action, /logoutMerchantToken/);
  assert.match(action, /logoutAdmin/);
  assert.match(action, /MERCHANT_SESSION_COOKIE/);
  assert.match(action, /ADMIN_SESSION_COOKIE/);
  assert.doesNotMatch(action, /CUSTOMER_SESSION_COOKIE|logoutCustomer/);
});

test("merchant auth pages are accessible forms with verified signup and recovery", async () => {
  const [signup, complete, login, forgot, reset, forms] = await Promise.all([
    readFile("src/app/(marketing)/signup/page.tsx", "utf8"),
    readFile("src/app/(marketing)/complete-signup/page.tsx", "utf8"),
    readFile("src/app/(marketing)/login/page.tsx", "utf8"),
    readFile("src/app/(marketing)/forgot-password/page.tsx", "utf8"),
    readFile("src/app/(marketing)/reset-password/page.tsx", "utf8"),
    readFile("src/app/(marketing)/_components/MerchantAuthForms.tsx", "utf8"),
  ]);
  assert.match(signup, /MerchantSignupForm/);
  assert.match(complete, /MerchantCompleteSignupForm/);
  assert.match(login, /MerchantLoginForm/);
  assert.match(forgot, /MerchantForgotPasswordForm/);
  assert.match(reset, /MerchantResetPasswordForm/);
  assert.match(forms, /autoComplete="name"/);
  assert.match(forms, /autoComplete="email"/);
  assert.match(forms, /autoComplete="tel"/);
  assert.match(forms, /autoComplete="new-password"/);
  assert.match(forms, /min-h-11/);
});

test("dashboard accepts a trusted Owner or Manager principal without tenant request authority", async () => {
  const [page, login] = await Promise.all([
    readFile("src/app/(merchant)/dashboard/page.tsx", "utf8"),
    readFile("src/app/(marketing)/login/page.tsx", "utf8"),
  ]);
  assert.match(page, /requireStoreDashboardPrincipal\(\)/);
  assert.match(page, /principal\.kind === "manager"/);
  assert.match(page, /listManagedStores\(principal\.adminUserId\)/);
  assert.match(login, /getCurrentStoreDashboardPrincipal\(\)/);
  assert.doesNotMatch(
    page,
    /getTenant\(|getDbForTenant|TenantLink|getCurrentCustomer|TENANT_SCHEMA_HEADER|search_path/
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
