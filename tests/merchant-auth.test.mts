import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MERCHANT_PASSWORD_MIN_LENGTH,
  MERCHANT_PASSWORD_RESET_TTL_MS,
  MERCHANT_SESSION_TTL_MS,
  MERCHANT_SIGNUP_MAX_SENDS_PER_HOUR,
  MERCHANT_SIGNUP_RESEND_COOLDOWN_MS,
  MERCHANT_SIGNUP_TOKEN_TTL_MS,
  authenticateMerchant,
  beginMerchantSignup,
  completeMerchantSignup,
  createMerchantSession,
  inspectMerchantSignupToken,
  logoutMerchant,
  normalizeMerchantEmail,
  requestMerchantPasswordReset,
  resendMerchantSignupVerification,
  resetMerchantPassword,
  resolveMerchantSession,
  type MerchantAuthRepository,
  type MerchantPasswordResetDelivery,
  type MerchantRecord,
  type MerchantSignupDelivery,
  type MerchantSignupIssueResult,
  type MerchantSignupTokenState,
  type StoredMerchantSession,
} from "../src/lib/merchant-auth/core.ts";
import { normalizeMerchantPhone } from "../src/lib/merchant-auth/phone.ts";
import {
  getMerchantSessionCookieOptions,
  shouldUseSecureMerchantCookie,
} from "../src/lib/merchant-auth/cookie.ts";

const validPassword = "correct horse battery staple";

test("merchant verified-signup schema is additive and password starts unset", async () => {
  const [schema, account, migration23, migration24] = await Promise.all([
    readFile("src/drizzle/control-plane-schema.ts", "utf8"),
    readFile("src/drizzle/control-schema/merchantAccount.ts", "utf8"),
    readFile("src/drizzle/control-migrations/0023_merchant_pending_status.sql", "utf8"),
    readFile("src/drizzle/control-migrations/0024_merchant_verified_signup.sql", "utf8"),
  ]);

  assert.match(schema, /merchantSignupToken/);
  assert.match(account, /passwordHash: varchar\("password_hash"/);
  assert.doesNotMatch(account, /passwordHash:[^\n]*\.notNull\(\)/);
  assert.match(account, /default\("pending_verification"\)/);
  assert.match(migration23, /pending_verification/);
  assert.match(migration24, /merchant_signup_tokens/);
  assert.match(migration24, /DROP NOT NULL/);
  assert.doesNotMatch(migration23 + migration24, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});

test("merchant email normalization applies NFKC, trim, and lowercase", () => {
  assert.equal(
    normalizeMerchantEmail("  MERCHANT＠EXAMPLE.COM  "),
    "merchant@example.com"
  );
});

test("merchant phone normalization stores deterministic E.164", () => {
  assert.equal(normalizeMerchantPhone("050-1234567"), "+972501234567");
  assert.equal(normalizeMerchantPhone("+972 50 123 4567"), "+972501234567");
  assert.throws(() => normalizeMerchantPhone("050-ABC-4567"), /invalid_phone/);
  assert.throws(() => normalizeMerchantPhone("501234567"), /invalid_phone/);
});

test("signup creates a pending merchant and stores only a 24-hour token hash", async () => {
  const repository = new FakeMerchantRepository();
  const delivery = new FakeMerchantSignupDelivery();
  const now = new Date("2026-10-03T00:00:00Z");

  const result = await beginMerchantSignup(repository, delivery, {
    email: "MERCHANT@example.com",
    displayName: "Merchant",
    phone: "050-1234567",
    buildVerificationUrl: (token) =>
      `https://dev.shopnest.co.il/complete-signup?token=${token}`,
    now,
  });

  assert.deepEqual(result, { kind: "sent" });
  const merchant = repository.users.get(1)!;
  assert.equal(merchant.status, "pending_verification");
  assert.equal(merchant.passwordHash, null);
  assert.equal(merchant.emailVerifiedAt, null);
  assert.equal(merchant.emailNormalized, "merchant@example.com");
  assert.equal(delivery.messages.length, 1);

  const token = new URL(delivery.messages[0].verificationUrl).searchParams.get("token");
  assert.ok(token);
  assert.equal(repository.signupTokens.has(token!), false);
  const [stored] = [...repository.signupTokens.entries()];
  assert.match(stored[0], /^[a-f0-9]{64}$/);
  assert.equal(
    stored[1].expiresAt.getTime() - now.getTime(),
    MERCHANT_SIGNUP_TOKEN_TTL_MS
  );
});

test("failed signup delivery removes the unsent token so retry is possible", async () => {
  const repository = new FakeMerchantRepository();
  const now = new Date("2026-10-03T00:00:00Z");
  const failingDelivery: MerchantSignupDelivery = {
    async deliverSignupVerification() {
      throw new Error("provider unavailable");
    },
  };

  await assert.rejects(
    beginMerchantSignup(repository, failingDelivery, {
      email: "merchant@example.com",
      displayName: "Merchant",
      phone: "050-1234567",
      buildVerificationUrl: (token) =>
        `https://example.test/complete-signup?token=${token}`,
      now,
    }),
    /provider unavailable/
  );
  assert.equal(repository.signupTokens.size, 0);

  const retryDelivery = new FakeMerchantSignupDelivery();
  assert.deepEqual(
    await beginMerchantSignup(repository, retryDelivery, {
      email: "merchant@example.com",
      displayName: "Merchant",
      phone: "050-1234567",
      buildVerificationUrl: (token) =>
        `https://example.test/complete-signup?token=${token}`,
      now: new Date(now.getTime() + 1_000),
    }),
    { kind: "sent" }
  );
  assert.equal(retryDelivery.messages.length, 1);
});

test("pending merchant cannot authenticate before email verification", async () => {
  const repository = new FakeMerchantRepository();
  const delivery = new FakeMerchantSignupDelivery();
  await beginMerchantSignup(repository, delivery, {
    email: "merchant@example.com",
    displayName: "Merchant",
    phone: "050-1234567",
    buildVerificationUrl: (token) => `https://example.test/complete-signup?token=${token}`,
  });

  assert.equal(
    await authenticateMerchant(repository, "merchant@example.com", validPassword),
    null
  );
});

test("signup completion verifies email, sets password, and token becomes single-use", async () => {
  const { repository, delivery, now } = await pendingRepository();
  const token = tokenFromDelivery(delivery);

  assert.equal(MERCHANT_PASSWORD_MIN_LENGTH, 12);
  assert.deepEqual(
    await completeMerchantSignup(repository, {
      token,
      password: "12345678901",
      now: new Date(now.getTime() + 1_000),
    }),
    { kind: "invalid_password" }
  );

  const completed = await completeMerchantSignup(repository, {
    token,
    password: validPassword,
    now: new Date(now.getTime() + 2_000),
  });
  assert.deepEqual(completed, { kind: "completed", merchantId: 1 });

  const merchant = repository.users.get(1)!;
  assert.equal(merchant.status, "active");
  assert.ok(merchant.emailVerifiedAt);
  assert.ok(merchant.passwordHash);
  assert.equal(
    (await authenticateMerchant(repository, "merchant@example.com", validPassword))?.id,
    1
  );

  assert.deepEqual(
    await completeMerchantSignup(repository, {
      token,
      password: "another secure password",
      now: new Date(now.getTime() + 3_000),
    }),
    { kind: "already_completed", merchantId: 1 }
  );

  assert.deepEqual(
    await inspectMerchantSignupToken(
      repository,
      token,
      new Date(now.getTime() + 4_000)
    ),
    { kind: "completed", merchantId: 1, email: "merchant@example.com" }
  );
});

test("expired signup token leads to resend and the old token cannot set a password", async () => {
  const { repository, delivery, now } = await pendingRepository();
  const oldToken = tokenFromDelivery(delivery);
  const expiredAt = new Date(now.getTime() + MERCHANT_SIGNUP_TOKEN_TTL_MS + 1);

  const state = await inspectMerchantSignupToken(repository, oldToken, expiredAt);
  assert.equal(state.kind, "expired");

  const resendDelivery = new FakeMerchantSignupDelivery();
  const resend = await resendMerchantSignupVerification(
    repository,
    resendDelivery,
    {
      token: oldToken,
      buildVerificationUrl: (token) =>
        `https://example.test/complete-signup?token=${token}`,
      now: expiredAt,
    }
  );
  assert.deepEqual(resend, { kind: "sent" });

  const newToken = tokenFromDelivery(resendDelivery);
  assert.notEqual(newToken, oldToken);
  assert.equal(
    (await inspectMerchantSignupToken(repository, oldToken, expiredAt)).kind,
    "expired"
  );
  assert.equal(
    (await inspectMerchantSignupToken(repository, newToken, expiredAt)).kind,
    "pending"
  );
});

test("signup resend enforces a 60-second cooldown and hourly send cap", async () => {
  const { repository, delivery, now } = await pendingRepository();
  const token = tokenFromDelivery(delivery);

  const cooldown = await resendMerchantSignupVerification(
    repository,
    new FakeMerchantSignupDelivery(),
    {
      token,
      buildVerificationUrl: (value) => `https://example.test/complete-signup?token=${value}`,
      now: new Date(now.getTime() + 1_000),
    }
  );
  assert.equal(cooldown.kind, "cooldown");
  assert.equal(MERCHANT_SIGNUP_RESEND_COOLDOWN_MS, 60_000);
  assert.equal(MERCHANT_SIGNUP_MAX_SENDS_PER_HOUR, 5);

  let currentToken = token;
  for (let i = 1; i < MERCHANT_SIGNUP_MAX_SENDS_PER_HOUR; i += 1) {
    const d = new FakeMerchantSignupDelivery();
    const result = await resendMerchantSignupVerification(repository, d, {
      token: currentToken,
      buildVerificationUrl: (value) => `https://example.test/complete-signup?token=${value}`,
      now: new Date(now.getTime() + i * 61_000),
    });
    assert.equal(result.kind, "sent");
    currentToken = tokenFromDelivery(d);
  }

  const limited = await resendMerchantSignupVerification(
    repository,
    new FakeMerchantSignupDelivery(),
    {
      token: currentToken,
      buildVerificationUrl: (value) => `https://example.test/complete-signup?token=${value}`,
      now: new Date(now.getTime() + MERCHANT_SIGNUP_MAX_SENDS_PER_HOUR * 61_000),
    }
  );
  assert.equal(limited.kind, "rate_limited");
});

test("verified merchant email cannot be registered again", async () => {
  const { repository, delivery, now } = await pendingRepository();
  await completeMerchantSignup(repository, {
    token: tokenFromDelivery(delivery),
    password: validPassword,
    now: new Date(now.getTime() + 1_000),
  });

  await assert.rejects(
    beginMerchantSignup(repository, new FakeMerchantSignupDelivery(), {
      email: " MERCHANT@example.com ",
      displayName: "Duplicate",
      phone: "050-1234567",
      buildVerificationUrl: (token) => `https://example.test/complete-signup?token=${token}`,
      now: new Date(now.getTime() + 2_000),
    }),
    /account_unavailable/
  );
});

test("merchant session stores only a hash and expires after exactly 24 hours", async () => {
  const repository = await repositoryWithMerchant();
  const now = new Date("2026-01-01T00:00:00Z");
  const session = await createMerchantSession(repository, 1, { now });
  assert.equal(repository.sessions.has(session.token), false);
  assert.match([...repository.sessions.keys()][0], /^[a-f0-9]{64}$/);
  assert.equal(session.expiresAt.getTime() - now.getTime(), MERCHANT_SESSION_TTL_MS);
  assert.equal(session.maxAgeSeconds, MERCHANT_SESSION_TTL_MS / 1000);
  assert.ok(await resolveMerchantSession(repository, session.token, now));
  assert.equal(
    await resolveMerchantSession(
      repository,
      session.token,
      new Date(now.getTime() + MERCHANT_SESSION_TTL_MS + 1)
    ),
    null
  );
});

test("merchant logout invalidates only the presented merchant session", async () => {
  const repository = await repositoryWithMerchant();
  const session = await createMerchantSession(repository, 1);
  await logoutMerchant(repository, session.token);
  assert.equal(await resolveMerchantSession(repository, session.token), null);
});

test("merchant cookie expiry matches DB session policy and Secure follows request protocol", async () => {
  const repository = await repositoryWithMerchant();
  const now = new Date("2026-01-01T00:00:00Z");
  const session = await createMerchantSession(repository, 1, { now });
  const options = getMerchantSessionCookieOptions(session, {
    origin: "http://localhost:3000",
    forwardedProto: null,
    nodeEnv: "production",
  });
  assert.equal(options.httpOnly, true);
  assert.equal(options.sameSite, "lax");
  assert.equal(options.path, "/");
  assert.equal(options.secure, false);
  assert.equal(options.expires, session.expiresAt);
  assert.equal(
    shouldUseSecureMerchantCookie({
      origin: "https://staging.shopnest.co.il",
      forwardedProto: null,
      nodeEnv: "development",
    }),
    true
  );
});

test("merchant password reset remains active-account only and single-use", async () => {
  const repository = await repositoryWithMerchant();
  const delivery = new FakeMerchantResetDelivery();
  const now = new Date("2026-01-01T00:00:00Z");

  assert.deepEqual(
    await requestMerchantPasswordReset(repository, delivery, {
      email: "unknown@example.com",
      buildResetUrl: (token) => `https://example.test/reset-password?token=${token}`,
      now,
    }),
    { accepted: true }
  );
  assert.equal(delivery.messages.length, 0);

  await requestMerchantPasswordReset(repository, delivery, {
    email: "merchant@example.com",
    buildResetUrl: (token) => `https://example.test/reset-password?token=${token}`,
    now,
  });
  assert.equal(delivery.messages.length, 1);
  const token = new URL(delivery.messages[0].resetUrl).searchParams.get("token")!;
  assert.equal(repository.resets.has(token), false);
  assert.equal(
    [...repository.resets.values()][0].expiresAt.getTime() - now.getTime(),
    MERCHANT_PASSWORD_RESET_TTL_MS
  );

  assert.equal(
    await resetMerchantPassword(repository, {
      token,
      password: "new secure password",
      now: new Date(now.getTime() + 1_000),
    }),
    true
  );
  assert.equal(
    await resetMerchantPassword(repository, {
      token,
      password: "another secure password",
      now: new Date(now.getTime() + 2_000),
    }),
    false
  );
});

test("Resend signup and password-reset delivery stay server-side and use configured sender", async () => {
  const [signupSource, resetSource] = await Promise.all([
    readFile("src/lib/merchant-auth/signup-delivery.ts", "utf8"),
    readFile("src/lib/merchant-auth/password-reset-delivery.ts", "utf8"),
  ]);

  for (const source of [signupSource, resetSource]) {
    assert.match(source, /import "server-only"/);
    assert.match(source, /https:\/\/api\.resend\.com\/emails/);
    assert.match(source, /RESEND_API_KEY/);
    assert.match(source, /SHOPNEST_EMAIL_FROM/);
    assert.doesNotMatch(source, /NEXT_PUBLIC_/);
  }

  assert.match(resetSource, /30 minutes/);
  assert.match(resetSource, /Merchant password reset email delivery is not configured/);
});

test("merchant auth persistence stays in the control plane", async () => {
  const source = await readFile("src/lib/merchant-auth/drizzle-repository.ts", "utf8");
  assert.match(source, /getControlPlaneDb/);
  assert.match(source, /merchantSignupTokens/);
  assert.doesNotMatch(
    source,
    /customerAccounts|customerSessions|adminUsers|getDbForTenant|getTenant\(|sql\.raw/
  );
});

class FakeMerchantRepository implements MerchantAuthRepository {
  users = new Map<number, MerchantRecord>();
  sessions = new Map<string, StoredMerchantSession>();
  signupTokens = new Map<
    string,
    {
      merchantId: number;
      expiresAt: Date;
      consumedAt: Date | null;
      createdAt: Date;
    }
  >();
  resets = new Map<
    string,
    { merchantId: number; expiresAt: Date; consumedAt: Date | null }
  >();
  nextId = 1;

  async findMerchantByNormalizedEmail(email: string) {
    return [...this.users.values()].find((user) => user.emailNormalized === email) ?? null;
  }

  async createPendingMerchant(input: {
    email: string;
    emailNormalized: string;
    displayName: string;
    phoneE164: string;
  }) {
    const merchant: MerchantRecord = {
      id: this.nextId++,
      ...input,
      passwordHash: null,
      emailVerifiedAt: null,
      status: "pending_verification",
    };
    this.users.set(merchant.id, merchant);
    return merchant;
  }

  async issueSignupToken(input: {
    merchantId: number;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
    cooldownMs: number;
    maxPerHour: number;
  }): Promise<MerchantSignupIssueResult> {
    const merchant = this.users.get(input.merchantId);
    if (
      !merchant ||
      merchant.status !== "pending_verification" ||
      merchant.emailVerifiedAt
    ) {
      return { kind: "unavailable" };
    }

    const tokens = [...this.signupTokens.values()]
      .filter((token) => token.merchantId === merchant.id)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const latest = tokens[0];

    if (latest && latest.createdAt.getTime() + input.cooldownMs > input.now.getTime()) {
      return {
        kind: "cooldown",
        nextAllowedAt: new Date(latest.createdAt.getTime() + input.cooldownMs),
      };
    }

    const recent = tokens.filter(
      (token) => token.createdAt.getTime() >= input.now.getTime() - 60 * 60 * 1000
    );
    if (recent.length >= input.maxPerHour) return { kind: "rate_limited" };

    for (const token of tokens) {
      if (!token.consumedAt) token.consumedAt = input.now;
    }

    this.signupTokens.set(input.tokenHash, {
      merchantId: merchant.id,
      expiresAt: input.expiresAt,
      consumedAt: null,
      createdAt: input.now,
    });
    return { kind: "issued" };
  }

  async inspectSignupToken(input: {
    tokenHash: string;
    now: Date;
  }): Promise<MerchantSignupTokenState> {
    const token = this.signupTokens.get(input.tokenHash);
    if (!token) return { kind: "invalid" };
    const merchant = this.users.get(token.merchantId);
    if (!merchant || merchant.status === "disabled") return { kind: "invalid" };
    if (merchant.status === "active" && merchant.emailVerifiedAt) {
      return { kind: "completed", merchantId: merchant.id, email: merchant.email };
    }
    if (
      token.consumedAt ||
      token.expiresAt.getTime() <= input.now.getTime()
    ) {
      return { kind: "expired", merchantId: merchant.id, email: merchant.email };
    }
    return {
      kind: "pending",
      merchantId: merchant.id,
      email: merchant.email,
      expiresAt: token.expiresAt,
    };
  }

  async deleteSignupTokenByHash(tokenHash: string) {
    this.signupTokens.delete(tokenHash);
  }

  async completeSignupToken(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
  }) {
    const token = this.signupTokens.get(input.tokenHash);
    if (!token) return { kind: "invalid" } as const;
    const merchant = this.users.get(token.merchantId);
    if (!merchant || merchant.status === "disabled") return { kind: "invalid" } as const;
    if (merchant.status === "active" && merchant.emailVerifiedAt) {
      return { kind: "already_completed", merchantId: merchant.id } as const;
    }
    if (token.consumedAt || token.expiresAt.getTime() <= input.now.getTime()) {
      return { kind: "expired" } as const;
    }

    merchant.passwordHash = input.passwordHash;
    merchant.emailVerifiedAt = input.now;
    merchant.status = "active";
    await this.deleteSessionsForMerchant(merchant.id);
    for (const entry of this.signupTokens.values()) {
      if (entry.merchantId === merchant.id && !entry.consumedAt) {
        entry.consumedAt = input.now;
      }
    }
    return { kind: "completed", merchantId: merchant.id } as const;
  }

  async createSession(input: { tokenHash: string; merchantId: number; expiresAt: Date }) {
    const merchant = this.users.get(input.merchantId);
    if (!merchant) throw new Error("merchant_missing");
    this.sessions.set(input.tokenHash, {
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      merchant: {
        id: merchant.id,
        email: merchant.email,
        displayName: merchant.displayName,
        phoneE164: merchant.phoneE164,
        status: merchant.status,
      },
    });
  }

  async findSessionByTokenHash(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }

  async deleteSessionByTokenHash(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }

  async deleteSessionsForMerchant(merchantId: number) {
    for (const [key, session] of this.sessions) {
      if (session.merchant.id === merchantId) this.sessions.delete(key);
    }
  }

  async issuePasswordResetToken(input: {
    emailNormalized: string;
    tokenHash: string;
    expiresAt: Date;
    now: Date;
  }) {
    const merchant = await this.findMerchantByNormalizedEmail(input.emailNormalized);
    if (
      !merchant ||
      merchant.status !== "active" ||
      !merchant.emailVerifiedAt ||
      !merchant.passwordHash
    ) {
      return null;
    }
    this.resets.set(input.tokenHash, {
      merchantId: merchant.id,
      expiresAt: input.expiresAt,
      consumedAt: null,
    });
    return { merchantId: merchant.id, email: merchant.email };
  }

  async consumePasswordResetToken(input: {
    tokenHash: string;
    passwordHash: string;
    now: Date;
  }) {
    const reset = this.resets.get(input.tokenHash);
    if (!reset || reset.consumedAt || reset.expiresAt.getTime() <= input.now.getTime()) {
      return false;
    }
    const merchant = this.users.get(reset.merchantId);
    if (!merchant || merchant.status !== "active" || !merchant.emailVerifiedAt) {
      return false;
    }
    merchant.passwordHash = input.passwordHash;
    reset.consumedAt = input.now;
    await this.deleteSessionsForMerchant(merchant.id);
    return true;
  }
}

class FakeMerchantSignupDelivery implements MerchantSignupDelivery {
  messages: Array<{ email: string; verificationUrl: string }> = [];

  async deliverSignupVerification(input: {
    email: string;
    verificationUrl: string;
  }) {
    this.messages.push(input);
  }
}

class FakeMerchantResetDelivery implements MerchantPasswordResetDelivery {
  messages: Array<{ email: string; resetUrl: string }> = [];

  async deliverPasswordReset(input: { email: string; resetUrl: string }) {
    this.messages.push(input);
  }
}

async function pendingRepository() {
  const repository = new FakeMerchantRepository();
  const delivery = new FakeMerchantSignupDelivery();
  const now = new Date("2026-10-03T00:00:00Z");
  await beginMerchantSignup(repository, delivery, {
    email: "merchant@example.com",
    displayName: "Merchant",
    phone: "050-1234567",
    buildVerificationUrl: (token) =>
      `https://example.test/complete-signup?token=${token}`,
    now,
  });
  return { repository, delivery, now };
}

async function repositoryWithMerchant() {
  const { repository, delivery, now } = await pendingRepository();
  const result = await completeMerchantSignup(repository, {
    token: tokenFromDelivery(delivery),
    password: validPassword,
    now: new Date(now.getTime() + 1_000),
  });
  assert.equal(result.kind, "completed");
  return repository;
}

function tokenFromDelivery(delivery: FakeMerchantSignupDelivery) {
  const token = new URL(delivery.messages.at(-1)!.verificationUrl).searchParams.get("token");
  assert.ok(token);
  return token;
}
