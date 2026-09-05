import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CUSTOMER_NORMAL_SESSION_TTL_MS,
  createCustomerSession,
  hashCustomerSessionToken,
  type CustomerAuthRepository,
  type CustomerRecord,
  type StoredCustomerSession,
} from "../src/lib/customer-auth/core.ts";
import {
  GOOGLE_AUTHORIZATION_ENDPOINT,
  GOOGLE_OAUTH_CALLBACK_PATH,
  GOOGLE_OAUTH_TRANSACTION_TTL_MS,
  beginGoogleOAuth,
  consumeGoogleOAuthState,
  exchangeGoogleAuthorizationCode,
  hashGoogleOAuthSecret,
  resolveGoogleOAuthConfiguration,
  validateGoogleIdTokenClaims,
  type GoogleOAuthRepository,
  type StoredGoogleOAuthTransaction,
} from "../src/lib/customer-auth/google-oauth.ts";

const configuration = {
  clientId: "shopnest-test.apps.googleusercontent.com",
  clientSecret: "test-secret-never-logged",
  redirectUri: "http://localhost:3000/api/customer-auth/google/callback",
};
const now = new Date("2026-01-01T00:00:00Z");

test("OAuth state, nonce, browser binding, and PKCE are cryptographically random", async () => {
  const repository = new FakeGoogleRepository();
  const started = await beginGoogleOAuth(repository, {
    configuration,
    tenantSlug: "gift-shop",
    callbackPath: "/gift-shop/account",
    now,
  });
  const url = new URL(started.authorizationUrl);
  const state = requiredParam(url, "state");
  const nonce = requiredParam(url, "nonce");
  assert.equal(url.origin + url.pathname, GOOGLE_AUTHORIZATION_ENDPOINT);
  assert.equal(Buffer.from(state, "base64url").byteLength, 32);
  assert.equal(Buffer.from(nonce, "base64url").byteLength, 32);
  assert.equal(Buffer.from(started.browserBinding.split(".")[1], "base64url").byteLength, 32);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(requiredParam(url, "code_challenge"), /^[A-Za-z0-9_-]{43}$/);
  assert.equal(url.searchParams.has("client_secret"), false);
  assert.equal(repository.transactions.has(state), false);
  assert.equal(repository.transactions.has(hashGoogleOAuthSecret(state)), true);
  assert.equal(repository.rawNonceWasStored(nonce), false);
});

test("OAuth state is short-lived, browser-bound, tenant-bound, and one-use", async () => {
  const repository = new FakeGoogleRepository();
  const started = await beginGoogleOAuth(repository, {
    configuration,
    tenantSlug: "gift-shop",
    callbackPath: "/gift-shop/account",
    now,
  });
  const state = requiredParam(new URL(started.authorizationUrl), "state");
  assert.equal(
    started.expiresAt.getTime() - now.getTime(),
    GOOGLE_OAUTH_TRANSACTION_TTL_MS
  );
  assert.equal(
    await consumeGoogleOAuthState(repository, {
      state: "invalid-state",
      browserBinding: started.browserBinding,
      now,
    }),
    null
  );
  assert.equal(
    await consumeGoogleOAuthState(repository, {
      state,
      browserBinding: `panda-pop.${started.browserBinding.split(".")[1]}`,
      now,
    }),
    null
  );
  const consumed = await consumeGoogleOAuthState(repository, {
    state,
    browserBinding: started.browserBinding,
    now,
  });
  assert.equal(consumed?.tenantSlug, "gift-shop");
  assert.equal(
    await consumeGoogleOAuthState(repository, {
      state,
      browserBinding: started.browserBinding,
      now,
    }),
    null
  );

  const expired = await beginGoogleOAuth(repository, {
    configuration,
    tenantSlug: "gift-shop",
    callbackPath: "/gift-shop",
    now,
  });
  assert.equal(
    await consumeGoogleOAuthState(repository, {
      state: requiredParam(new URL(expired.authorizationUrl), "state"),
      browserBinding: expired.browserBinding,
      now: new Date(now.getTime() + GOOGLE_OAUTH_TRANSACTION_TTL_MS + 1),
    }),
    null
  );
});

test("OAuth transaction rejects unknown tenants and normalizes unsafe callbacks", async () => {
  const repository = new FakeGoogleRepository();
  await assert.rejects(
    beginGoogleOAuth(repository, {
      configuration,
      tenantSlug: "random-store",
      callbackPath: "/random-store/account",
      now,
    }),
    /tenant_invalid/
  );
  const started = await beginGoogleOAuth(repository, {
    configuration,
    tenantSlug: "gift-shop",
    callbackPath: "https://evil.example/steal",
    now,
  });
  const stored = await consumeGoogleOAuthState(repository, {
    state: requiredParam(new URL(started.authorizationUrl), "state"),
    browserBinding: started.browserBinding,
    now,
  });
  assert.equal(stored?.callbackPath, "/gift-shop");
});

test("independent tenant OAuth transactions cannot be crossed", async () => {
  const repository = new FakeGoogleRepository();
  const gift = await beginGoogleOAuth(repository, {
    configuration,
    tenantSlug: "gift-shop",
    callbackPath: "/gift-shop/account",
    now,
  });
  const panda = await beginGoogleOAuth(repository, {
    configuration,
    tenantSlug: "panda-pop",
    callbackPath: "/panda-pop/account",
    now,
  });
  assert.equal(
    await consumeGoogleOAuthState(repository, {
      state: requiredParam(new URL(gift.authorizationUrl), "state"),
      browserBinding: panda.browserBinding,
      now,
    }),
    null
  );
  const giftTransaction = await consumeGoogleOAuthState(repository, {
    state: requiredParam(new URL(gift.authorizationUrl), "state"),
    browserBinding: gift.browserBinding,
    now,
  });
  const pandaTransaction = await consumeGoogleOAuthState(repository, {
    state: requiredParam(new URL(panda.authorizationUrl), "state"),
    browserBinding: panda.browserBinding,
    now,
  });
  assert.equal(giftTransaction?.tenantSlug, "gift-shop");
  assert.equal(pandaTransaction?.tenantSlug, "panda-pop");
});

test("Google configuration requires both credentials and a safe exact callback", () => {
  assert.equal(
    resolveGoogleOAuthConfiguration({ requestOrigin: "http://localhost:3000" }),
    null
  );
  assert.deepEqual(
    resolveGoogleOAuthConfiguration({
      clientId: configuration.clientId,
      clientSecret: configuration.clientSecret,
      requestOrigin: "http://localhost:3000",
    }),
    configuration
  );
  assert.equal(
    resolveGoogleOAuthConfiguration({
      clientId: configuration.clientId,
      clientSecret: configuration.clientSecret,
      redirectUri: "http://shop.example/api/customer-auth/google/callback",
      requestOrigin: "https://shop.example",
    }),
    null
  );
  assert.equal(
    resolveGoogleOAuthConfiguration({
      clientId: configuration.clientId,
      clientSecret: configuration.clientSecret,
      redirectUri: "https://shop.example/not-the-callback",
      requestOrigin: "https://shop.example",
    }),
    null
  );
});

test("authorization-code exchange uses PKCE and returns only the ID token", async () => {
  let postedBody = "";
  const idToken = await exchangeGoogleAuthorizationCode(
    configuration,
    { code: "one-time-code", codeVerifier: "verifier" },
    (async (_url: string | URL | Request, init?: RequestInit) => {
      postedBody = String(init?.body);
      return new Response(JSON.stringify({
        access_token: "unused-access-token",
        refresh_token: "must-not-be-persisted",
        id_token: "signed-id-token",
      }), { status: 200 });
    }) as typeof fetch
  );
  assert.equal(idToken, "signed-id-token");
  const body = new URLSearchParams(postedBody);
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code_verifier"), "verifier");
  assert.equal(body.get("redirect_uri"), configuration.redirectUri);
  assert.equal(body.has("access_type"), false);
});

test("Google token endpoint errors fail closed", async () => {
  await assert.rejects(
    exchangeGoogleAuthorizationCode(
      configuration,
      { code: "bad-code", codeVerifier: "verifier" },
      (async () => new Response(JSON.stringify({ error: "invalid_grant" }), {
        status: 400,
      })) as typeof fetch
    ),
    /google_token_exchange_failed/
  );
});

test("verified Google token claims are accepted", () => {
  const nonce = "expected-nonce";
  assert.deepEqual(
    validateGoogleIdTokenClaims(validClaims(nonce), {
      clientId: configuration.clientId,
      nonceHash: hashGoogleOAuthSecret(nonce),
      now,
    }),
    {
      subject: "google-subject-1",
      email: "customer@example.com",
      emailNormalized: "customer@example.com",
      displayName: "Google Customer",
    }
  );
});

for (const [name, change] of [
  ["invalid issuer", { iss: "https://evil.example" }],
  ["wrong audience", { aud: "another-client" }],
  ["wrong authorized party", { aud: [configuration.clientId, "other"], azp: "other" }],
  ["expired token", { exp: Math.floor(now.getTime() / 1000) }],
  ["unverified email", { email_verified: false }],
  ["missing subject", { sub: undefined }],
  ["nonce mismatch", { nonce: "wrong-nonce" }],
] as const) {
  test(`${name} is rejected`, () => {
    assert.throws(
      () =>
        validateGoogleIdTokenClaims(
          { ...validClaims("expected-nonce"), ...change },
          {
            clientId: configuration.clientId,
            nonceHash: hashGoogleOAuthSecret("expected-nonce"),
            now,
          }
        ),
      /google_identity_invalid/
    );
  });
}

test("new Google identity creates one global customer and links provider once", async () => {
  const repository = new FakeGoogleRepository();
  const customer = await repository.resolveGoogleCustomer(googleIdentity());
  const repeat = await repository.resolveGoogleCustomer(googleIdentity());
  assert.equal(customer.id, repeat.id);
  assert.equal(repository.customers.size, 1);
  assert.equal(repository.identities.size, 1);
  assert.equal(customer.passwordHash, null);
});

test("concurrent first Google logins cannot duplicate account or identity", async () => {
  const repository = new FakeGoogleRepository();
  const customers = await Promise.all(
    Array.from({ length: 8 }, () => repository.resolveGoogleCustomer(googleIdentity()))
  );
  assert.equal(new Set(customers.map((customer) => customer.id)).size, 1);
  assert.equal(repository.customers.size, 1);
  assert.equal(repository.identities.size, 1);
});

test("verified matching email links to an active password account", async () => {
  const repository = new FakeGoogleRepository();
  const existing = repository.addCustomer({
    email: "customer@example.com",
    passwordHash: "scrypt$password-account",
  });
  const linked = await repository.resolveGoogleCustomer(googleIdentity());
  assert.equal(linked.id, existing.id);
  assert.equal(repository.identities.get("google-subject-1"), existing.id);
  assert.equal(linked.passwordHash, "scrypt$password-account");
});

test("disabled matching account is not authenticated", async () => {
  const repository = new FakeGoogleRepository();
  repository.addCustomer({ email: "customer@example.com", status: "disabled" });
  await assert.rejects(
    repository.resolveGoogleCustomer(googleIdentity()),
    /account_unavailable/
  );
  assert.equal(repository.identities.size, 0);
});

test("an existing Google subject cannot be stolen by another email account", async () => {
  const repository = new FakeGoogleRepository();
  const original = repository.addCustomer({ email: "original@example.com" });
  repository.identities.set("google-subject-1", original.id);
  const other = repository.addCustomer({ email: "customer@example.com" });
  const resolved = await repository.resolveGoogleCustomer(googleIdentity());
  assert.equal(resolved.id, original.id);
  assert.notEqual(resolved.id, other.id);
  assert.equal(resolved.email, "original@example.com");
});

test("Google login issues a standard ShopNest session, not a Google token", async () => {
  const repository = new FakeGoogleRepository();
  const customer = await repository.resolveGoogleCustomer(googleIdentity());
  const session = await createCustomerSession(
    repository as unknown as CustomerAuthRepository,
    customer.id,
    { now }
  );
  assert.equal(
    session.expiresAt.getTime() - now.getTime(),
    CUSTOMER_NORMAL_SESSION_TTL_MS
  );
  assert.notEqual(session.token, "signed-id-token");
  assert.equal(repository.sessions.has(hashCustomerSessionToken(session.token)), true);
});

test("callback uses trusted transaction tenant and reuses tenant-local cart linking", async () => {
  const [callback, start, oidc, login, english, hebrew] = await Promise.all([
    readFile("src/app/api/customer-auth/google/callback/route.ts", "utf8"),
    readFile("src/app/(customer)/account/google/start/route.ts", "utf8"),
    readFile("src/lib/customer-auth/google-oidc.ts", "utf8"),
    readFile("src/app/(customer)/account/login/page.tsx", "utf8"),
    readFile("src/messages/en.json", "utf8"),
    readFile("src/messages/he.json", "utf8"),
  ]);
  assert.match(start, /getTenant\(\)[\s\S]*beginGoogleOAuth/);
  assert.doesNotMatch(start, /searchParams\.get\([^)]*tenant/i);
  assert.match(callback, /resolveConfiguredTenant\(transaction\.tenantSlug\)/);
  assert.match(callback, /linkGuestCartToCustomer[\s\S]*getDbForTenant\(tenant\)/);
  assert.doesNotMatch(callback, /searchParams\.get\([^)]*tenant/i);
  assert.match(callback, /createCustomerSession\(repository, customer\.id\)/);
  assert.doesNotMatch(callback, /access_token|refresh_token/);
  assert.match(callback, /providerError === "access_denied" \? "cancelled"/);
  assert.match(oidc, /createRemoteJWKSet[\s\S]*jwtVerify/);
  assert.match(login, /GoogleLoginButton/);
  assert.match(english, /Continue with Google/);
  assert.match(hebrew, /המשך עם Google/);
});

test("ShopNest logout does not call a Google logout or revoke endpoint", async () => {
  const actions = await readFile("src/app/(customer)/account/_actions.ts", "utf8");
  assert.match(actions, /logoutCustomerToken/);
  assert.doesNotMatch(actions, /googleapis\.com\/revoke|accounts\.google\.com.*logout/i);
});

test("database layer enforces provider uniqueness and transactional identity linking", async () => {
  const [schema, repository, migration] = await Promise.all([
    readFile("src/drizzle/control-schema/customerAuthIdentity.ts", "utf8"),
    readFile("src/lib/customer-auth/drizzle-repository.ts", "utf8"),
    readFile("src/drizzle/control-migrations/0003_customer_google_oauth.sql", "utf8"),
  ]);
  assert.match(schema, /uniqueIndex\("customer_auth_provider_account_unique"\)/);
  assert.match(repository, /resolveGoogleCustomer[\s\S]*transaction/);
  assert.match(repository, /pg_advisory_xact_lock/);
  assert.match(repository, /onConflictDoNothing/);
  assert.match(migration, /customer_oauth_transactions/);
  assert.match(migration, /REFERENCES "public"\."tenants"/);
});

function validClaims(nonce: string) {
  return {
    iss: "https://accounts.google.com",
    aud: configuration.clientId,
    exp: Math.floor(now.getTime() / 1000) + 300,
    sub: "google-subject-1",
    nonce,
    email: " Customer@Example.COM ",
    email_verified: true,
    name: " Google Customer ",
  };
}

function googleIdentity() {
  return {
    subject: "google-subject-1",
    email: "customer@example.com",
    emailNormalized: "customer@example.com",
    displayName: "Google Customer",
    verifiedAt: now,
  };
}

function requiredParam(url: URL, name: string) {
  const value = url.searchParams.get(name);
  assert.ok(value);
  return value;
}

class FakeGoogleRepository implements GoogleOAuthRepository {
  transactions = new Map<string, StoredGoogleOAuthTransaction & { browserBindingHash: string }>();
  customers = new Map<number, CustomerRecord>();
  identities = new Map<string, number>();
  sessions = new Map<string, StoredCustomerSession>();
  private nextId = 1;
  private identityQueue = Promise.resolve();

  async createGoogleOAuthTransaction(input: {
    stateHash: string;
    browserBindingHash: string;
    tenantSlug: string;
    callbackPath: string;
    nonceHash: string;
    codeVerifier: string;
    expiresAt: Date;
  }) {
    this.transactions.set(input.stateHash, {
      tenantSlug: input.tenantSlug,
      callbackPath: input.callbackPath,
      nonceHash: input.nonceHash,
      codeVerifier: input.codeVerifier,
      expiresAt: input.expiresAt,
      browserBindingHash: input.browserBindingHash,
    });
  }

  async consumeGoogleOAuthTransaction(input: {
    stateHash: string;
    browserBindingHash: string;
    tenantSlug: string;
    now: Date;
  }) {
    const transaction = this.transactions.get(input.stateHash);
    if (
      !transaction ||
      transaction.browserBindingHash !== input.browserBindingHash ||
      transaction.tenantSlug !== input.tenantSlug ||
      transaction.expiresAt.getTime() <= input.now.getTime()
    ) {
      return null;
    }
    this.transactions.delete(input.stateHash);
    const { browserBindingHash: _binding, ...stored } = transaction;
    return stored;
  }

  rawNonceWasStored(nonce: string) {
    return [...this.transactions.values()].some((row) => row.nonceHash === nonce);
  }

  resolveGoogleCustomer(input: ReturnType<typeof googleIdentity>) {
    const previous = this.identityQueue;
    let release!: () => void;
    this.identityQueue = new Promise<void>((resolve) => { release = resolve; });
    return previous.then(async () => {
      try {
        const linkedId = this.identities.get(input.subject);
        if (linkedId) {
          const linked = this.customers.get(linkedId)!;
          if (linked.status !== "active") throw new Error("google_account_unavailable");
          return linked;
        }
        let customer = [...this.customers.values()].find(
          (candidate) => candidate.emailNormalized === input.emailNormalized
        );
        if (customer?.status === "disabled") throw new Error("google_account_unavailable");
        if (!customer) {
          customer = this.addCustomer({
            email: input.email,
            displayName: input.displayName,
          });
        }
        const conflictingId = this.identities.get(input.subject);
        if (conflictingId && conflictingId !== customer.id) {
          throw new Error("google_identity_conflict");
        }
        this.identities.set(input.subject, customer.id);
        return customer;
      } finally {
        release();
      }
    });
  }

  addCustomer(input: {
    email: string;
    passwordHash?: string | null;
    displayName?: string | null;
    status?: "active" | "disabled";
  }) {
    const customer: CustomerRecord = {
      id: this.nextId++,
      email: input.email,
      emailNormalized: input.email.toLowerCase(),
      passwordHash: input.passwordHash ?? null,
      displayName: input.displayName ?? null,
      status: input.status ?? "active",
    };
    this.customers.set(customer.id, customer);
    return customer;
  }

  async createSession(input: { tokenHash: string; customerId: number; expiresAt: Date }) {
    const customer = this.customers.get(input.customerId)!;
    this.sessions.set(input.tokenHash, {
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      customer,
    });
  }
}
