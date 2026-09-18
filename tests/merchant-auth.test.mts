import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("merchant identity uses dedicated control-plane tables", async () => {
  const schema = await readFile("src/drizzle/control-plane-schema.ts", "utf8");
  assert.match(schema, /merchantAccount/);
  assert.match(schema, /merchantSession/);
  assert.match(schema, /merchantPasswordReset/);
});

test("merchant migration is additive and keeps phone non-unique", async () => {
  const sql = await readFile(
    "src/drizzle/control-migrations/0006_merchant_identity.sql",
    "utf8"
  );
  assert.match(sql, /CREATE TABLE "merchant_accounts"/);
  assert.match(sql, /CREATE TABLE "merchant_sessions"/);
  assert.match(sql, /CREATE TABLE "merchant_password_reset_tokens"/);
  assert.match(sql, /CONSTRAINT "merchant_accounts_email_normalized_unique" UNIQUE\("email_normalized"\)/);
  assert.doesNotMatch(sql, /UNIQUE\s*\(\s*"phone_e164"\s*\)|UNIQUE INDEX[^\n]*phone_e164/i);
  assert.doesNotMatch(sql, /DROP TABLE|TRUNCATE|DELETE FROM/);
  assert.match(sql, /merchant_sessions[\s\S]*REFERENCES "public"\."merchant_accounts"\("id"\) ON DELETE cascade/);
  assert.match(sql, /merchant_password_reset_tokens[\s\S]*REFERENCES "public"\."merchant_accounts"\("id"\) ON DELETE cascade/);
  assert.doesNotMatch(sql, /tenant_|schema_name|search_path/);
});

test("merchant schema keeps phone nullable and email normalized unique", async () => {
  const account = await readFile("src/drizzle/control-schema/merchantAccount.ts", "utf8");
  assert.match(account, /emailNormalized:[\s\S]*\.notNull\(\)[\s\S]*\.unique\(\)/);
  assert.match(account, /phoneE164: varchar\("phone_e164"/);
  assert.doesNotMatch(account, /phoneE164:[^;]*\.unique\(\)/);
});

import {
  MERCHANT_PASSWORD_MIN_LENGTH,
  MERCHANT_PASSWORD_RESET_TTL_MS,
  MERCHANT_SESSION_TTL_MS,
  authenticateMerchant,
  createMerchantSession,
  hashMerchantSessionToken,
  logoutMerchant,
  normalizeMerchantEmail,
  requestMerchantPasswordReset,
  resetMerchantPassword,
  registerMerchant,
  resolveMerchantSession,
  type MerchantAuthRepository,
  type MerchantPasswordResetDelivery,
  type MerchantRecord,
  type StoredMerchantSession,
} from "../src/lib/merchant-auth/core.ts";
import { normalizeMerchantPhone } from "../src/lib/merchant-auth/phone.ts";
import {
  getMerchantSessionCookieOptions,
  shouldUseSecureMerchantCookie,
} from "../src/lib/merchant-auth/cookie.ts";

const validPassword = "correct horse battery staple";

test("merchant email normalization applies NFKC, trim, and lowercase", () => {
  assert.equal(
    normalizeMerchantEmail("  MERCHANT＠EXAMPLE.COM  "),
    "merchant@example.com"
  );
});

test("merchant password policy rejects eleven characters and accepts twelve", async () => {
  const repository = new FakeMerchantRepository();
  await assert.rejects(
    registerMerchant(repository, {
      email: "merchant@example.com",
      password: "12345678901",
      displayName: "Merchant",
      phone: "050-1234567",
    }),
    /invalid_password/
  );
  assert.equal(MERCHANT_PASSWORD_MIN_LENGTH, 12);

  const merchant = await registerMerchant(repository, {
    email: "merchant@example.com",
    password: "123456789012",
    displayName: "Merchant",
    phone: "050-1234567",
  });
  assert.equal(merchant.emailNormalized, "merchant@example.com");
});

test("merchant phone normalization stores deterministic E.164", () => {
  assert.equal(normalizeMerchantPhone("050-1234567"), "+972501234567");
  assert.equal(normalizeMerchantPhone("+972 50 123 4567"), "+972501234567");
  assert.throws(() => normalizeMerchantPhone("050-ABC-4567"), /invalid_phone/);
  assert.throws(() => normalizeMerchantPhone("501234567"), /invalid_phone/);
});

test("duplicate merchant email is rejected and phone is not an identity key", async () => {
  const repository = new FakeMerchantRepository();
  await registerMerchant(repository, {
    email: "merchant@example.com",
    password: validPassword,
    displayName: "Merchant",
    phone: "050-1234567",
  });
  await assert.rejects(
    registerMerchant(repository, {
      email: " MERCHANT@example.com ",
      password: validPassword,
      displayName: "Duplicate",
      phone: "050-1234567",
    }),
    /account_unavailable/
  );
});

test("merchant authentication is active-account and password gated", async () => {
  const repository = await repositoryWithMerchant();
  assert.equal(
    (await authenticateMerchant(repository, "MERCHANT@example.com", validPassword))?.id,
    1
  );
  assert.equal(
    await authenticateMerchant(repository, "merchant@example.com", "wrong password"),
    null
  );
  repository.users.get(1)!.status = "disabled";
  assert.equal(
    await authenticateMerchant(repository, "merchant@example.com", validPassword),
    null
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
  assert.equal(repository.sessions.size, 0);
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

class FakeMerchantRepository implements MerchantAuthRepository {
  users = new Map<number, MerchantRecord>();
  sessions = new Map<string, StoredMerchantSession>();
  resets = new Map<string, { merchantId: number; expiresAt: Date; consumedAt: Date | null }>();
  nextId = 1;

  async findMerchantByNormalizedEmail(email: string) {
    return [...this.users.values()].find((user) => user.emailNormalized === email) ?? null;
  }

  async createMerchantWithPassword(input: {
    email: string;
    emailNormalized: string;
    passwordHash: string;
    displayName: string;
    phoneE164: string;
  }) {
    const merchant: MerchantRecord = {
      id: this.nextId++,
      ...input,
      emailVerifiedAt: null,
      status: "active",
    };
    this.users.set(merchant.id, merchant);
    return merchant;
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
    if (!merchant || merchant.status !== "active") return null;
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
    if (!merchant || merchant.status !== "active") return false;
    merchant.passwordHash = input.passwordHash;
    reset.consumedAt = input.now;
    await this.deleteSessionsForMerchant(merchant.id);
    return true;
  }
}

async function repositoryWithMerchant() {
  const repository = new FakeMerchantRepository();
  await registerMerchant(repository, {
    email: "merchant@example.com",
    password: validPassword,
    displayName: "Merchant",
    phone: "050-1234567",
  });
  return repository;
}

test("merchant password reset request does not enumerate accounts and stores only a token hash", async () => {
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

  assert.deepEqual(
    await requestMerchantPasswordReset(repository, delivery, {
      email: "merchant@example.com",
      buildResetUrl: (token) => `https://example.test/reset-password?token=${token}`,
      now,
    }),
    { accepted: true }
  );
  assert.equal(delivery.messages.length, 1);
  const token = new URL(delivery.messages[0].resetUrl).searchParams.get("token");
  assert.ok(token);
  assert.equal(repository.resets.has(token!), false);
  assert.match([...repository.resets.keys()][0], /^[a-f0-9]{64}$/);
  assert.equal(
    [...repository.resets.values()][0].expiresAt.getTime() - now.getTime(),
    MERCHANT_PASSWORD_RESET_TTL_MS
  );
});

test("merchant password reset is single-use, rejects expiry, and invalidates sessions", async () => {
  const repository = await repositoryWithMerchant();
  const delivery = new FakeMerchantResetDelivery();
  const now = new Date("2026-01-01T00:00:00Z");
  const session = await createMerchantSession(repository, 1, { now });

  await requestMerchantPasswordReset(repository, delivery, {
    email: "merchant@example.com",
    buildResetUrl: (token) => `https://example.test/reset-password?token=${token}`,
    now,
  });
  const token = new URL(delivery.messages[0].resetUrl).searchParams.get("token")!;

  assert.equal(
    await resetMerchantPassword(repository, {
      token,
      password: "new secure password",
      now: new Date(now.getTime() + 1000),
    }),
    true
  );
  assert.equal(repository.sessions.size, 0);
  assert.equal(await resolveMerchantSession(repository, session.token, now), null);
  assert.equal(
    await resetMerchantPassword(repository, {
      token,
      password: "another secure password",
      now: new Date(now.getTime() + 2000),
    }),
    false
  );

  const expiredRepository = await repositoryWithMerchant();
  const expiredDelivery = new FakeMerchantResetDelivery();
  await requestMerchantPasswordReset(expiredRepository, expiredDelivery, {
    email: "merchant@example.com",
    buildResetUrl: (value) => `https://example.test/reset-password?token=${value}`,
    now,
  });
  const expiredToken = new URL(expiredDelivery.messages[0].resetUrl).searchParams.get("token")!;
  assert.equal(
    await resetMerchantPassword(expiredRepository, {
      token: expiredToken,
      password: "new secure password",
      now: new Date(now.getTime() + MERCHANT_PASSWORD_RESET_TTL_MS + 1),
    }),
    false
  );
});

test("merchant auth persistence is isolated from customer, admin, tenant DB, and raw SQL", async () => {
  const source = await readFile("src/lib/merchant-auth/drizzle-repository.ts", "utf8");
  assert.match(source, /getControlPlaneDb/);
  assert.doesNotMatch(
    source,
    /customerAccounts|customerSessions|adminUsers|getDbForTenant|getTenant\(|sql\.raw/
  );
});

class FakeMerchantResetDelivery implements MerchantPasswordResetDelivery {
  messages: Array<{ email: string; resetUrl: string }> = [];
  async deliverPasswordReset(input: { email: string; resetUrl: string }) {
    this.messages.push(input);
  }
}
