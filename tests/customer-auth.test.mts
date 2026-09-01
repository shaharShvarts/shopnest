import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CUSTOMER_SESSION_TTL_MS,
  authenticateCustomer,
  createCustomerSession,
  getCustomerSocialProviderStatus,
  logoutCustomer,
  normalizeCustomerEmail,
  registerCustomer,
  resolveCustomerSession,
  resolveSafeTenantCallback,
  type CustomerAuthRepository,
  type CustomerRecord,
  type StoredCustomerSession,
} from "../src/lib/customer-auth/core.ts";
import { hashCustomerPassword } from "../src/lib/customer-auth/password.mjs";
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
  const session = await createCustomerSession(repository, 1, now);
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

test("unimplemented Google and Apple providers are disabled honestly", () => {
  assert.deepEqual(getCustomerSocialProviderStatus(), {
    google: "not_implemented",
    apple: "planned",
  });
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
  assert.equal(JSON.parse(journal).entries.at(-1).tag, "0001_customer_identity");
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
  ].map((path) => readFile(path, "utf8")));
  assert.equal(routes.length, 4);
  assert.equal(routes.every((source) => source.length > 0), true);
  const layout = await readFile("src/app/(customer)/layout.tsx", "utf8");
  assert.match(layout, /account\/login/);
  assert.doesNotMatch(layout, /account\/admin|admin\/account/);
});

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
