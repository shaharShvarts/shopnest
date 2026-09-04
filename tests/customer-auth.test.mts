import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CUSTOMER_NORMAL_SESSION_TTL_MS,
  CUSTOMER_PASSWORD_RESET_COOLDOWN_MS,
  CUSTOMER_PASSWORD_RESET_TTL_MS,
  CUSTOMER_REMEMBERED_SESSION_TTL_MS,
  CUSTOMER_SESSION_TTL_MS,
  authenticateCustomer,
  createCustomerSession,
  generateCustomerPasswordResetToken,
  getCustomerSocialProviderStatus,
  hashCustomerPasswordResetToken,
  hashCustomerSessionToken,
  logoutCustomer,
  normalizeCustomerEmail,
  registerCustomer,
  requestCustomerPasswordReset,
  resetCustomerPassword,
  resolveCustomerSession,
  resolveSafeTenantCallback,
  type CustomerAuthRepository,
  type CustomerRecord,
  type StoredCustomerSession,
} from "../src/lib/customer-auth/core.ts";
import {
  hashCustomerPassword,
  verifyCustomerPassword,
} from "../src/lib/customer-auth/password.mjs";
import {
  getCustomerSessionCookieOptions,
  shouldUseSecureCustomerCookie,
} from "../src/lib/customer-auth/cookie.ts";
import {
  createPasswordResetDelivery,
  DevelopmentPasswordResetDelivery,
  UnconfiguredPasswordResetDelivery,
} from "../src/lib/customer-auth/password-reset-delivery.ts";
import {
  linkGuestCartToCustomer,
  mergeCartQuantities,
  type CartLinkResult,
  type CustomerCartLinkStore,
} from "../src/lib/customer-commerce/cart-link.ts";

const password = "correct horse battery staple";

test("registration creates a global password account", async () => {
  const repository = new FakeCustomerRepository();
  const customer = await registerCustomer(repository, {
    email: " Customer@Example.COM ",
    password,
    displayName: "Customer",
  });
  assert.equal(customer.emailNormalized, "customer@example.com");
  assert.ok(customer.passwordHash?.startsWith("scrypt$"));
  assert.equal(repository.users.size, 1);
});

test("duplicate normalized email is rejected without creating another account", async () => {
  const repository = new FakeCustomerRepository();
  await registerCustomer(repository, {
    email: "customer@example.com",
    password,
    displayName: "Customer",
  });
  await assert.rejects(
    registerCustomer(repository, {
      email: " CUSTOMER@example.com ",
      password,
      displayName: "Duplicate",
    }),
    /account_unavailable/
  );
  assert.equal(repository.users.size, 1);
});

test("email normalization trims, case-folds, and applies compatibility normalization", () => {
  assert.equal(
    normalizeCustomerEmail("  CUSTOMER＠EXAMPLE.COM  "),
    "customer@example.com"
  );
});

test("valid password login succeeds and invalid password is generic", async () => {
  const repository = await repositoryWithCustomer();
  assert.equal(
    (await authenticateCustomer(repository, "CUSTOMER@example.com", password))
      ?.id,
    1
  );
  assert.equal(
    await authenticateCustomer(repository, "customer@example.com", "wrong"),
    null
  );
});

test("disabled customer cannot authenticate", async () => {
  const repository = await repositoryWithCustomer();
  repository.users.get(1)!.status = "disabled";
  assert.equal(
    await authenticateCustomer(repository, "customer@example.com", password),
    null
  );
});

test("logout invalidates only the customer session", async () => {
  const repository = await repositoryWithCustomer();
  const session = await createCustomerSession(repository, 1);
  assert.ok(await resolveCustomerSession(repository, session.token));
  await logoutCustomer(repository, session.token);
  assert.equal(await resolveCustomerSession(repository, session.token), null);
});

test("customer session stores only a hash of the opaque browser token", async () => {
  const repository = await repositoryWithCustomer();
  const session = await createCustomerSession(repository, 1);
  assert.equal(repository.sessions.has(session.token), false);
  assert.equal(repository.sessions.size, 1);
  assert.match([...repository.sessions.keys()][0], /^[a-f0-9]{64}$/);
});

test("normal and remembered sessions use the server-owned 24 hour and 30 day policies", async () => {
  const repository = await repositoryWithCustomer();
  const now = new Date("2026-01-01T00:00:00Z");
  const normal = await createCustomerSession(repository, 1, { now });
  const remembered = await createCustomerSession(repository, 1, {
    now,
    rememberMe: true,
  });
  assert.equal(
    normal.expiresAt.getTime() - now.getTime(),
    CUSTOMER_NORMAL_SESSION_TTL_MS
  );
  assert.equal(normal.maxAgeSeconds, CUSTOMER_NORMAL_SESSION_TTL_MS / 1000);
  assert.equal(
    remembered.expiresAt.getTime() - now.getTime(),
    CUSTOMER_REMEMBERED_SESSION_TTL_MS
  );
  assert.equal(
    remembered.maxAgeSeconds,
    CUSTOMER_REMEMBERED_SESSION_TTL_MS / 1000
  );
  assert.ok(await resolveCustomerSession(repository, normal.token, now));
  assert.ok(await resolveCustomerSession(repository, remembered.token, now));
});

test("arbitrary client expiry input cannot override the remembered-session policy", async () => {
  const repository = await repositoryWithCustomer();
  const now = new Date("2026-01-01T00:00:00Z");
  const session = await createCustomerSession(repository, 1, {
    rememberMe: true,
    now,
    expiresAt: new Date("2099-01-01T00:00:00Z"),
  } as { rememberMe: boolean; now: Date });
  assert.equal(
    session.expiresAt.getTime() - now.getTime(),
    CUSTOMER_REMEMBERED_SESSION_TTL_MS
  );
  const actions = await readFile("src/app/(customer)/account/_actions.ts", "utf8");
  assert.doesNotMatch(actions, /formData[^\n]*(expiry|duration|maxAge)/i);
});

test("cookie expiry matches DB policy and Secure follows the actual request protocol", async () => {
  const repository = await repositoryWithCustomer();
  const now = new Date("2026-01-01T00:00:00Z");
  const session = await createCustomerSession(repository, 1, {
    rememberMe: true,
    now,
  });
  const options = getCustomerSessionCookieOptions(session, {
    origin: "http://localhost:3000",
    forwardedProto: null,
    nodeEnv: "production",
  });
  assert.equal(options.expires, session.expiresAt);
  assert.equal(
    options.expires.getTime() - now.getTime(),
    CUSTOMER_REMEMBERED_SESSION_TTL_MS
  );
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.secure, false);
  assert.equal(
    shouldUseSecureCustomerCookie({
      origin: "https://shop.example",
      forwardedProto: null,
      nodeEnv: "development",
    }),
    true
  );
});

test("successful authentication rotates any existing customer session token", async () => {
  const actions = await readFile(
    "src/app/(customer)/account/_actions.ts",
    "utf8"
  );
  assert.match(
    actions,
    /logoutCustomerToken\([\s\S]*CUSTOMER_SESSION_COOKIE[\s\S]*createCustomerSession/
  );
});

test("expired customer session is rejected and removed", async () => {
  const repository = await repositoryWithCustomer();
  const now = new Date("2026-01-01T00:00:00Z");
  const session = await createCustomerSession(repository, 1, { now });
  assert.equal(
    await resolveCustomerSession(
      repository,
      session.token,
      new Date(now.getTime() + CUSTOMER_SESSION_TTL_MS + 1)
    ),
    null
  );
  assert.equal(repository.sessions.size, 0);
});

test("normal and remembered sessions are rejected at their respective expiries", async () => {
  const repository = await repositoryWithCustomer();
  const now = new Date("2026-01-01T00:00:00Z");
  const normal = await createCustomerSession(repository, 1, { now });
  const remembered = await createCustomerSession(repository, 1, {
    now,
    rememberMe: true,
  });
  assert.equal(
    await resolveCustomerSession(
      repository,
      normal.token,
      new Date(now.getTime() + CUSTOMER_NORMAL_SESSION_TTL_MS + 1)
    ),
    null
  );
  assert.equal(
    await resolveCustomerSession(
      repository,
      remembered.token,
      new Date(now.getTime() + CUSTOMER_REMEMBERED_SESSION_TTL_MS + 1)
    ),
    null
  );
});

test("existing seven-day sessions remain valid until their stored server expiry", async () => {
  const repository = await repositoryWithCustomer();
  const token = "legacy-seven-day-session";
  const now = new Date("2026-01-01T00:00:00Z");
  repository.sessions.set(hashCustomerSessionToken(token), {
    tokenHash: hashCustomerSessionToken(token),
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    customer: {
      id: 1,
      email: "customer@example.com",
      displayName: "Customer",
      status: "active",
    },
  });
  assert.ok(
    await resolveCustomerSession(
      repository,
      token,
      new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)
    )
  );
});

test("customer and admin authentication use separate cookies, repositories, and routes", async () => {
  const [customerServer, adminServer, adminLayout] = await Promise.all([
    readFile("src/lib/customer-auth/server.ts", "utf8"),
    readFile("src/lib/admin-auth/server.ts", "utf8"),
    readFile("src/app/admin/layout.tsx", "utf8"),
  ]);
  assert.match(customerServer, /shopnest_customer_session/);
  assert.match(adminServer, /shopnest_admin_session/);
  assert.doesNotMatch(customerServer, /DrizzleAdminAuthRepository/);
  assert.doesNotMatch(adminLayout, /getCurrentCustomer/);
});

test("an admin session cookie is never accepted by customer session resolution", async () => {
  const customerServer = await readFile("src/lib/customer-auth/server.ts", "utf8");
  assert.match(customerServer, /CUSTOMER_SESSION_COOKIE/);
  assert.doesNotMatch(customerServer, /shopnest_admin_session|resolveAdminSession/);
});

test("a customer session cookie cannot authorize an admin layout", async () => {
  const adminServer = await readFile("src/lib/admin-auth/server.ts", "utf8");
  const adminLayout = await readFile("src/app/admin/layout.tsx", "utf8");
  assert.doesNotMatch(adminServer, /shopnest_customer_session|getCurrentCustomer/);
  assert.doesNotMatch(adminLayout, /shopnest_customer_session|getCurrentCustomer/);
});

test("membership records current tenant and the same identity can join two tenants", async () => {
  const repository = await repositoryWithCustomer();
  await repository.upsertTenantMembership({ customerId: 1, tenantSlug: "gift-shop", seenAt: new Date() });
  await repository.upsertTenantMembership({ customerId: 1, tenantSlug: "panda-pop", seenAt: new Date() });
  assert.equal(await repository.hasTenantMembership(1, "gift-shop"), true);
  assert.equal(await repository.hasTenantMembership(1, "panda-pop"), true);
});

test("membership schema contains no tenant commerce data or admin role", async () => {
  const source = await readFile("src/drizzle/control-schema/customerTenant.ts", "utf8");
  assert.match(source, /customerId[\s\S]*tenantSlug[\s\S]*firstSeenAt[\s\S]*lastSeenAt/);
  assert.doesNotMatch(source, /order|cart|address|role|schemaName/);
});

test("guest checkout remains allowed without a customer account", async () => {
  const [checkoutAction, checkoutCore] = await Promise.all([
    readFile("src/app/(customer)/_actions/checkout.ts", "utf8"),
    readFile("src/lib/checkout/create-order.ts", "utf8"),
  ]);
  assert.match(checkoutAction, /getCommerceIdentity\(\)/);
  assert.match(checkoutCore, /identity\.sessionId/);
  assert.doesNotMatch(checkoutAction, /redirect\([^)]*account\/login/);
});

test("login and registration preserve a guest cart through the tenant-local linker", async () => {
  const store = new FakeCartLinkStore({ kind: "transferred", adjustments: [] });
  const result = await linkGuestCartToCustomer(store, {
    customerId: 1,
    guestSessionId: "guest-session",
  });
  assert.equal(result.kind, "transferred");
  assert.deepEqual(store.calls, [{ customerId: 1, guestSessionId: "guest-session" }]);
});

test("cart merge sums quantities but caps them at current availability", () => {
  const result = mergeCartQuantities(
    [{ productId: 1, quantity: 3 }, { productId: 2, quantity: 1 }],
    [{ productId: 1, quantity: 4 }],
    new Map([[1, 5], [2, 1]])
  );
  assert.deepEqual(result.items, [
    { productId: 1, quantity: 5 },
    { productId: 2, quantity: 1 },
  ]);
  assert.deepEqual(result.adjustments, [
    { productId: 1, requested: 7, reserved: 5 },
  ]);
});

test("cart linking is tenant-local and avoids double-counting both existing holds", async () => {
  const [actions, linker] = await Promise.all([
    readFile("src/app/(customer)/account/_actions.ts", "utf8"),
    readFile("src/lib/customer-commerce/drizzle-cart-link.ts", "utf8"),
  ]);
  assert.match(actions, /getTenant\(\)[\s\S]*getDbForTenant\(tenant\)/);
  assert.doesNotMatch(actions, /formData\.get\([^)]*tenant/);
  assert.match(linker, /\[guestAttempt, accountAttempt\]/);
  assert.match(linker, /markAttemptReservations\([\s\S]*guestAttempt[\s\S]*"released"/);
  assert.match(linker, /reserveCartInventoryInTransaction/);
  assert.match(linker, /row\.ownerKey !== attempt\.ownerKey/);
});

test("existing reservation ownership is verified before transfer or exclusion", async () => {
  const linker = await readFile(
    "src/lib/customer-commerce/drizzle-cart-link.ts",
    "utf8"
  );
  assert.match(linker, /transferReservationOwnership[\s\S]*row\.ownerKey !== oldOwner/);
  assert.match(linker, /assertAttemptOwnership[\s\S]*row\.ownerKey !== attempt\.ownerKey/);
  assert.match(linker, /row\.cartId !== attempt\.cartId/);
});

test("suspended tenant storefront rules still wrap every customer account route", async () => {
  const layout = await readFile("src/app/(customer)/layout.tsx", "utf8");
  assert.match(layout, /requireActiveTenantStorefront\(\)/);
  assert.match(layout, /forbidden\(\)/);
});

test("callbacks remain tenant-local and cannot target admin or external origins", () => {
  assert.equal(
    resolveSafeTenantCallback("/gift-shop/categories?q=gift", "/gift-shop"),
    "/gift-shop/categories?q=gift"
  );
  for (const callback of [
    "https://evil.example/",
    "//evil.example/",
    "/panda-pop/categories",
    "/gift-shop/admin",
  ]) {
    assert.equal(
      resolveSafeTenantCallback(callback, "/gift-shop"),
      "/gift-shop"
    );
  }
});

test("Google is implemented while Apple remains planned", () => {
  assert.deepEqual(getCustomerSocialProviderStatus(), {
    google: "implemented",
    apple: "planned",
  });
});

test("forgot password returns the same neutral result for existing, missing, and disabled customers", async () => {
  const knownRepository = await repositoryWithCustomer();
  const missingRepository = await repositoryWithCustomer();
  const disabledRepository = await repositoryWithCustomer();
  disabledRepository.users.get(1)!.status = "disabled";
  const now = new Date("2026-01-01T00:00:00Z");
  const knownDelivery = new CapturingResetDelivery();
  const missingDelivery = new CapturingResetDelivery();
  const disabledDelivery = new CapturingResetDelivery();

  const known = await requestCustomerPasswordReset(
    knownRepository,
    knownDelivery,
    resetRequest("customer@example.com", now)
  );
  const missing = await requestCustomerPasswordReset(
    missingRepository,
    missingDelivery,
    resetRequest("missing@example.com", now)
  );
  const disabled = await requestCustomerPasswordReset(
    disabledRepository,
    disabledDelivery,
    resetRequest("customer@example.com", now)
  );

  assert.deepEqual(known, { accepted: true });
  assert.deepEqual(missing, known);
  assert.deepEqual(disabled, known);
  assert.equal(knownDelivery.messages.length, 1);
  assert.equal(missingDelivery.messages.length, 0);
  assert.equal(disabledDelivery.messages.length, 0);
});

test("reset tokens use 256 bits of randomness and only their SHA-256 hash is stored", async () => {
  const generated = generateCustomerPasswordResetToken();
  assert.equal(Buffer.from(generated, "base64url").byteLength, 32);
  assert.match(hashCustomerPasswordResetToken(generated), /^[a-f0-9]{64}$/);

  const repository = await repositoryWithCustomer();
  const delivery = new CapturingResetDelivery();
  await requestCustomerPasswordReset(
    repository,
    delivery,
    resetRequest("customer@example.com", new Date("2026-01-01T00:00:00Z"))
  );
  const rawToken = tokenFromDelivery(delivery);
  assert.equal(repository.resetTokens.has(rawToken), false);
  assert.equal(
    repository.resetTokens.has(hashCustomerPasswordResetToken(rawToken)),
    true
  );
});

test("invalid, expired, and already-used reset tokens are rejected", async () => {
  const repository = await repositoryWithCustomer();
  const now = new Date("2026-01-01T00:00:00Z");
  assert.equal(
    await resetCustomerPassword(repository, {
      token: "invalid",
      password: "new correct horse battery staple",
      now,
    }),
    false
  );

  const delivery = new CapturingResetDelivery();
  await requestCustomerPasswordReset(
    repository,
    delivery,
    resetRequest("customer@example.com", now)
  );
  const token = tokenFromDelivery(delivery);
  assert.equal(
    await resetCustomerPassword(repository, {
      token,
      password: "new correct horse battery staple",
      now: new Date(now.getTime() + CUSTOMER_PASSWORD_RESET_TTL_MS + 1),
    }),
    false
  );

  const secondNow = new Date(
    now.getTime() + CUSTOMER_PASSWORD_RESET_TTL_MS +
      CUSTOMER_PASSWORD_RESET_COOLDOWN_MS + 1
  );
  const secondDelivery = new CapturingResetDelivery();
  await requestCustomerPasswordReset(
    repository,
    secondDelivery,
    resetRequest("customer@example.com", secondNow)
  );
  const secondToken = tokenFromDelivery(secondDelivery);
  assert.equal(
    await resetCustomerPassword(repository, {
      token: secondToken,
      password: "new correct horse battery staple",
      now: secondNow,
    }),
    true
  );
  assert.equal(
    await resetCustomerPassword(repository, {
      token: secondToken,
      password: "another correct horse battery staple",
      now: secondNow,
    }),
    false
  );
});

test("concurrent reuse can consume a reset token only once", async () => {
  const repository = await repositoryWithCustomer();
  const delivery = new CapturingResetDelivery();
  const now = new Date("2026-01-01T00:00:00Z");
  await requestCustomerPasswordReset(
    repository,
    delivery,
    resetRequest("customer@example.com", now)
  );
  const token = tokenFromDelivery(delivery);
  const results = await Promise.all([
    resetCustomerPassword(repository, {
      token,
      password: "first valid replacement password",
      now,
    }),
    resetCustomerPassword(repository, {
      token,
      password: "second valid replacement password",
      now,
    }),
  ]);
  assert.deepEqual(results.sort(), [false, true]);
});

test("successful reset changes the password, revokes all sessions, and invalidates outstanding tokens", async () => {
  const repository = await repositoryWithCustomer();
  const oldNormal = await createCustomerSession(repository, 1);
  const oldRemembered = await createCustomerSession(repository, 1, {
    rememberMe: true,
  });
  const now = new Date("2026-01-01T00:00:00Z");
  const firstDelivery = new CapturingResetDelivery();
  await requestCustomerPasswordReset(
    repository,
    firstDelivery,
    resetRequest("customer@example.com", now)
  );
  const firstToken = tokenFromDelivery(firstDelivery);

  const replacementTime = new Date(
    now.getTime() + CUSTOMER_PASSWORD_RESET_COOLDOWN_MS + 1
  );
  const replacementDelivery = new CapturingResetDelivery();
  await requestCustomerPasswordReset(
    repository,
    replacementDelivery,
    resetRequest("customer@example.com", replacementTime)
  );
  const replacementToken = tokenFromDelivery(replacementDelivery);
  assert.equal(
    await resetCustomerPassword(repository, {
      token: firstToken,
      password: "a new password with 12 chars",
      now: replacementTime,
    }),
    false
  );

  const nextPassword = "a much better new password";
  assert.equal(
    await resetCustomerPassword(repository, {
      token: replacementToken,
      password: nextPassword,
      now: replacementTime,
    }),
    true
  );
  const customer = repository.users.get(1)!;
  assert.equal(await verifyCustomerPassword(password, customer.passwordHash!), false);
  assert.equal(await verifyCustomerPassword(nextPassword, customer.passwordHash!), true);
  assert.equal(
    await authenticateCustomer(repository, customer.email, password),
    null
  );
  assert.equal(
    (await authenticateCustomer(repository, customer.email, nextPassword))?.id,
    1
  );
  assert.equal(await resolveCustomerSession(repository, oldNormal.token), null);
  assert.equal(await resolveCustomerSession(repository, oldRemembered.token), null);
  assert.equal(
    [...repository.resetTokens.values()].every((token) => token.usedAt !== null),
    true
  );
});

test("password reset enforces the existing password policy", async () => {
  const repository = await repositoryWithCustomer();
  const delivery = new CapturingResetDelivery();
  const now = new Date("2026-01-01T00:00:00Z");
  await requestCustomerPasswordReset(
    repository,
    delivery,
    resetRequest("customer@example.com", now)
  );
  assert.equal(
    await resetCustomerPassword(repository, {
      token: tokenFromDelivery(delivery),
      password: "too short",
      now,
    }),
    false
  );
});

test("reset form rejects a password mismatch before token consumption", async () => {
  const actions = await readFile("src/app/(customer)/account/_actions.ts", "utf8");
  assert.match(
    actions,
    /resetPasswordSchema[\s\S]*value\.password === value\.passwordConfirmation/
  );
  assert.match(
    actions,
    /data\.password !== data\.passwordConfirmation[\s\S]*passwordMismatch/
  );
});

test("reset requests are cooled down and active tokens stay bounded", async () => {
  const repository = await repositoryWithCustomer();
  const delivery = new CapturingResetDelivery();
  const now = new Date("2026-01-01T00:00:00Z");
  await requestCustomerPasswordReset(
    repository,
    delivery,
    resetRequest("customer@example.com", now)
  );
  await requestCustomerPasswordReset(
    repository,
    delivery,
    resetRequest(
      "customer@example.com",
      new Date(now.getTime() + CUSTOMER_PASSWORD_RESET_COOLDOWN_MS - 1)
    )
  );
  assert.equal(delivery.messages.length, 1);
  assert.equal(
    [...repository.resetTokens.values()].filter((token) => !token.usedAt).length,
    1
  );
});

test("customer reset remains global identity only and never selects a tenant database", async () => {
  const [actions, repository, migration] = await Promise.all([
    readFile("src/app/(customer)/account/_actions.ts", "utf8"),
    readFile("src/lib/customer-auth/drizzle-repository.ts", "utf8"),
    readFile(
      "src/drizzle/control-migrations/0002_customer_password_reset.sql",
      "utf8"
    ),
  ]);
  const resetAction = actions.slice(actions.indexOf("forgotCustomerPasswordAction"));
  assert.match(resetAction, /getTenant\(\)/);
  assert.doesNotMatch(resetAction, /getDbForTenant|schema|formData\.get\([^)]*tenant/);
  assert.match(repository, /controlPlaneDb\.transaction/);
  assert.doesNotMatch(repository, /adminUsers|DrizzleAdminAuthRepository/);
  assert.match(migration, /customer_password_reset_tokens/);
  assert.doesNotMatch(migration, /CREATE SCHEMA|tenant_slug/);
});

test("admin identities are never eligible for the customer reset repository", async () => {
  const [actions, repository, migration] = await Promise.all([
    readFile("src/app/(customer)/account/_actions.ts", "utf8"),
    readFile("src/lib/customer-auth/drizzle-repository.ts", "utf8"),
    readFile(
      "src/drizzle/control-migrations/0002_customer_password_reset.sql",
      "utf8"
    ),
  ]);
  assert.doesNotMatch(actions, /admin-auth|adminUsers|ADMIN_SESSION/);
  assert.doesNotMatch(repository, /adminUsers|admin_sessions/);
  assert.match(migration, /REFERENCES "public"\."customer_accounts"/);
  assert.doesNotMatch(migration, /admin_users/);
});

test("forgot/reset routes, localized UI, and a production-safe delivery boundary are present", async () => {
  const [login, forgot, reset, delivery, english, hebrew] = await Promise.all([
    readFile("src/app/(customer)/account/_components/CustomerLoginForm.tsx", "utf8"),
    readFile("src/app/(customer)/forgot-password/page.tsx", "utf8"),
    readFile("src/app/(customer)/reset-password/page.tsx", "utf8"),
    readFile("src/lib/customer-auth/password-reset-delivery.ts", "utf8"),
    readFile("src/messages/en.json", "utf8"),
    readFile("src/messages/he.json", "utf8"),
  ]);
  assert.match(login, /name="rememberMe"[\s\S]*forgotPassword/);
  assert.match(forgot, /ForgotPasswordForm/);
  assert.match(reset, /ResetPasswordForm/);
  assert.match(
    delivery,
    /nodeEnv !== "production" \|\| developmentCaptureEnabled[\s\S]*UnconfiguredPasswordResetDelivery/
  );
  assert.match(english, /Remember me[\s\S]*Forgot password/);
  assert.match(hebrew, /זכור אותי[\s\S]*שכחת סיסמה/);
});

test("production reset delivery is silent unless local capture is explicitly enabled", () => {
  assert.ok(
    createPasswordResetDelivery({ nodeEnv: "production" }) instanceof
      UnconfiguredPasswordResetDelivery
  );
  assert.ok(
    createPasswordResetDelivery({
      nodeEnv: "production",
      developmentCaptureEnabled: true,
    }) instanceof DevelopmentPasswordResetDelivery
  );
  assert.ok(
    createPasswordResetDelivery({ nodeEnv: "test" }) instanceof
      DevelopmentPasswordResetDelivery
  );
});

test("customer identity migration is public, journaled, and control-plane idempotency remains hash-checked", async () => {
  const [migration, journal, provisioner] = await Promise.all([
    readFile("src/drizzle/control-migrations/0001_customer_identity.sql", "utf8"),
    readFile("src/drizzle/control-migrations/meta/_journal.json", "utf8"),
    readFile("scripts/lib/control-plane-provisioning.mjs", "utf8"),
  ]);
  assert.match(migration, /CREATE TABLE "customer_accounts"/);
  assert.match(migration, /REFERENCES "public"\."tenants"/);
  assert.doesNotMatch(migration, /CREATE SCHEMA/);
  assert.equal(
    JSON.parse(journal).entries.some(
      (entry: { tag: string }) => entry.tag === "0001_customer_identity"
    ),
    true
  );
  assert.equal(
    JSON.parse(journal).entries.at(-1).tag,
    "0003_customer_google_oauth"
  );
  assert.match(provisioner, /SELECT hash[\s\S]*assertMigrationHash/);
});

test("registered checkout and order history use only trusted tenant DB access", async () => {
  const [checkout, history] = await Promise.all([
    readFile("src/app/(customer)/_actions/checkout.ts", "utf8"),
    readFile("src/app/(customer)/account/orders/page.tsx", "utf8"),
  ]);
  assert.match(checkout, /getDbForTenant\(tenant\)/);
  assert.match(history, /getDbForTenant\(tenant\)/);
  assert.match(history, /eq\(orders\.customerAccountId, customer\.id\)/);
  assert.doesNotMatch(history, /searchParams[\s\S]*tenant|formData/);
});

test("customer commerce links are nullable opaque IDs without cross-schema foreign keys", async () => {
  const [cartSchema, orderSchema, migration] = await Promise.all([
    readFile("src/drizzle/schema/cart.ts", "utf8"),
    readFile("src/drizzle/schema/order.ts", "utf8"),
    readFile("src/drizzle/migrations/0005_customer_identity_link.sql", "utf8"),
  ]);
  assert.match(cartSchema, /customerAccountId/);
  assert.match(orderSchema, /customerAccountId/);
  assert.doesNotMatch(migration, /customer_account_id[\s\S]*REFERENCES\s+"public"/i);
});

test("tenant-prefixed account routes exist without introducing a customer admin route", async () => {
  const routes = await Promise.all([
    "src/app/(customer)/account/page.tsx",
    "src/app/(customer)/account/login/page.tsx",
    "src/app/(customer)/account/register/page.tsx",
    "src/app/(customer)/account/orders/page.tsx",
    "src/app/(customer)/forgot-password/page.tsx",
    "src/app/(customer)/reset-password/page.tsx",
    "src/app/(customer)/account/google/start/route.ts",
    "src/app/api/customer-auth/google/callback/route.ts",
  ].map((path) => readFile(path, "utf8")));
  assert.equal(routes.length, 8);
  assert.equal(routes.every((source) => source.length > 0), true);
  const layout = await readFile("src/app/(customer)/layout.tsx", "utf8");
  assert.match(layout, /account\/login/);
  assert.doesNotMatch(layout, /account\/admin|admin\/account/);
});

class CapturingResetDelivery {
  messages: Array<{ email: string; resetUrl: string }> = [];
  async deliverPasswordReset(input: { email: string; resetUrl: string }) {
    this.messages.push(input);
  }
}

function resetRequest(email: string, now: Date) {
  return {
    email,
    now,
    buildResetUrl: (token: string) =>
      `https://shop.example/gift-shop/reset-password?token=${encodeURIComponent(token)}`,
  };
}

function tokenFromDelivery(delivery: CapturingResetDelivery) {
  const resetUrl = delivery.messages.at(-1)?.resetUrl;
  assert.ok(resetUrl);
  const token = new URL(resetUrl).searchParams.get("token");
  assert.ok(token);
  return token;
}

class FakeCartLinkStore implements CustomerCartLinkStore {
  calls: Array<{ customerId: number; guestSessionId: string }> = [];
  private readonly result: CartLinkResult;
  constructor(result: CartLinkResult) {
    this.result = result;
  }
  async linkGuestCart(input: { customerId: number; guestSessionId: string }) {
    this.calls.push(input);
    return this.result;
  }
}

class FakeCustomerRepository implements CustomerAuthRepository {
  users = new Map<number, CustomerRecord>();
  sessions = new Map<string, StoredCustomerSession>();
  resetTokens = new Map<
    string,
    {
      customerId: number;
      expiresAt: Date;
      usedAt: Date | null;
      createdAt: Date;
    }
  >();
  memberships = new Set<string>();

  async findCustomerByNormalizedEmail(email: string) {
    return [...this.users.values()].find((user) => user.emailNormalized === email) ?? null;
  }
  async createCustomerWithPassword(input: { email: string; emailNormalized: string; passwordHash: string; displayName: string }) {
    if (await this.findCustomerByNormalizedEmail(input.emailNormalized)) throw new Error("duplicate");
    const customer: CustomerRecord = { id: this.users.size + 1, ...input, status: "active" };
    this.users.set(customer.id, customer);
    return customer;
  }
  async createSession(input: { tokenHash: string; customerId: number; expiresAt: Date }) {
    const user = this.users.get(input.customerId)!;
    this.sessions.set(input.tokenHash, {
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      customer: { id: user.id, email: user.email, displayName: user.displayName, status: user.status },
    });
  }
  async findSessionByTokenHash(tokenHash: string) {
    const session = this.sessions.get(tokenHash);
    if (!session) return null;
    return { ...session, customer: { ...session.customer, status: this.users.get(session.customer.id)!.status } };
  }
  async deleteSessionByTokenHash(tokenHash: string) { this.sessions.delete(tokenHash); }
  async issuePasswordResetToken(input: {
    emailNormalized: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
    cooldownMs: number;
  }) {
    const customer = await this.findCustomerByNormalizedEmail(
      input.emailNormalized
    );
    if (!customer || customer.status !== "active" || !customer.passwordHash) {
      return null;
    }
    const latestActive = [...this.resetTokens.values()]
      .filter((token) => token.customerId === customer.id && !token.usedAt)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (
      latestActive &&
      input.now.getTime() - latestActive.createdAt.getTime() < input.cooldownMs
    ) {
      return null;
    }
    for (const token of this.resetTokens.values()) {
      if (token.customerId === customer.id && !token.usedAt) {
        token.usedAt = input.now;
      }
    }
    this.resetTokens.set(input.tokenHash, {
      customerId: customer.id,
      expiresAt: input.expiresAt,
      usedAt: null,
      createdAt: input.now,
    });
    return { customerId: customer.id, email: customer.email };
  }
  async consumePasswordResetToken(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
  }) {
    const token = this.resetTokens.get(input.tokenHash);
    if (
      !token ||
      token.usedAt ||
      token.expiresAt.getTime() <= input.now.getTime()
    ) {
      return false;
    }
    const customer = this.users.get(token.customerId);
    if (!customer || customer.status !== "active" || !customer.passwordHash) {
      return false;
    }
    customer.passwordHash = input.passwordHash;
    for (const [hash, session] of this.sessions) {
      if (session.customer.id === customer.id) this.sessions.delete(hash);
    }
    for (const resetToken of this.resetTokens.values()) {
      if (resetToken.customerId === customer.id && !resetToken.usedAt) {
        resetToken.usedAt = input.now;
      }
    }
    return true;
  }
  async upsertTenantMembership(input: { customerId: number; tenantSlug: string; seenAt: Date }) { this.memberships.add(`${input.customerId}:${input.tenantSlug}`); }
  async hasTenantMembership(customerId: number, tenantSlug: string) { return this.memberships.has(`${customerId}:${tenantSlug}`); }
}

async function repositoryWithCustomer() {
  const repository = new FakeCustomerRepository();
  const passwordHash = await hashCustomerPassword(password);
  await repository.createCustomerWithPassword({
    email: "customer@example.com",
    emailNormalized: "customer@example.com",
    passwordHash,
    displayName: "Customer",
  });
  return repository;
}
