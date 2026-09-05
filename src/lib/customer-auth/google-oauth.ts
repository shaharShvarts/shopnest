import {
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import {
  normalizeCustomerEmail,
  resolveSafeTenantCallback,
  type CustomerRecord,
} from "./core.ts";
import { resolveConfiguredTenant } from "../tenant-validation.mjs";

export const GOOGLE_AUTHORIZATION_ENDPOINT =
  "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS_URI = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_OAUTH_TRANSACTION_TTL_MS = 10 * 60 * 1000;
export const GOOGLE_OAUTH_BINDING_COOKIE = "shopnest_google_oauth";
export const GOOGLE_OAUTH_CALLBACK_PATH = "/api/customer-auth/google/callback";
export const GOOGLE_OIDC_ISSUERS = [
  "https://accounts.google.com",
  "accounts.google.com",
] as const;

export type GoogleOAuthConfiguration = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type StoredGoogleOAuthTransaction = {
  tenantSlug: string;
  callbackPath: string;
  nonceHash: string;
  codeVerifier: string;
  expiresAt: Date;
};

export type VerifiedGoogleIdentity = {
  subject: string;
  email: string;
  emailNormalized: string;
  displayName: string | null;
};

export interface GoogleOAuthRepository {
  createGoogleOAuthTransaction(input: {
    stateHash: string;
    browserBindingHash: string;
    tenantSlug: string;
    callbackPath: string;
    nonceHash: string;
    codeVerifier: string;
    expiresAt: Date;
    createdAt: Date;
  }): Promise<void>;
  consumeGoogleOAuthTransaction(input: {
    stateHash: string;
    browserBindingHash: string;
    tenantSlug: string;
    now: Date;
  }): Promise<StoredGoogleOAuthTransaction | null>;
  resolveGoogleCustomer(input: {
    subject: string;
    email: string;
    emailNormalized: string;
    displayName: string | null;
    verifiedAt: Date;
  }): Promise<CustomerRecord>;
}

export function resolveGoogleOAuthConfiguration(input: {
  clientId?: string;
  clientSecret?: string;
  redirectUri?: string;
  requestOrigin: string;
}): GoogleOAuthConfiguration | null {
  const clientId = input.clientId?.trim();
  const clientSecret = input.clientSecret?.trim();
  if (!clientId || !clientSecret) return null;

  let redirect: URL;
  try {
    redirect = new URL(
      input.redirectUri?.trim() || GOOGLE_OAUTH_CALLBACK_PATH,
      input.requestOrigin
    );
  } catch {
    return null;
  }
  const localHttp =
    redirect.protocol === "http:" &&
    (redirect.hostname === "localhost" || redirect.hostname === "127.0.0.1");
  if (
    (redirect.protocol !== "https:" && !localHttp) ||
    redirect.pathname !== GOOGLE_OAUTH_CALLBACK_PATH ||
    redirect.username ||
    redirect.password ||
    redirect.search ||
    redirect.hash
  ) {
    return null;
  }
  return { clientId, clientSecret, redirectUri: redirect.toString() };
}

export async function beginGoogleOAuth(
  repository: GoogleOAuthRepository,
  input: {
    configuration: GoogleOAuthConfiguration;
    tenantSlug: string;
    callbackPath: string;
    now?: Date;
  }
) {
  const now = input.now ?? new Date();
  const tenant = resolveConfiguredTenant(input.tenantSlug);
  if (!tenant) throw new Error("google_oauth_tenant_invalid");
  const callbackPath = resolveSafeTenantCallback(
    input.callbackPath,
    tenant.basePath
  ).slice(0, 2048);
  const state = randomSecret(32);
  const nonce = randomSecret(32);
  const binding = randomSecret(32);
  const codeVerifier = randomSecret(64);
  const browserBinding = `${tenant.slug}.${binding}`;
  const expiresAt = new Date(now.getTime() + GOOGLE_OAUTH_TRANSACTION_TTL_MS);

  await repository.createGoogleOAuthTransaction({
    stateHash: hashGoogleOAuthSecret(state),
    browserBindingHash: hashGoogleOAuthSecret(browserBinding),
    tenantSlug: tenant.slug,
    callbackPath,
    nonceHash: hashGoogleOAuthSecret(nonce),
    codeVerifier,
    expiresAt,
    createdAt: now,
  });

  const authorizationUrl = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  authorizationUrl.searchParams.set("client_id", input.configuration.clientId);
  authorizationUrl.searchParams.set("redirect_uri", input.configuration.redirectUri);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", "openid email profile");
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("nonce", nonce);
  authorizationUrl.searchParams.set("code_challenge", pkceChallenge(codeVerifier));
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  authorizationUrl.searchParams.set("access_type", "online");
  authorizationUrl.searchParams.set("prompt", "select_account");

  return {
    authorizationUrl: authorizationUrl.toString(),
    browserBinding,
    expiresAt,
  };
}

export function consumeGoogleOAuthState(
  repository: GoogleOAuthRepository,
  input: {
    state: string | null;
    browserBinding: string | null;
    now?: Date;
  }
) {
  if (!input.state || !input.browserBinding) return Promise.resolve(null);
  const separator = input.browserBinding.indexOf(".");
  if (separator <= 0) return Promise.resolve(null);
  const tenant = resolveConfiguredTenant(
    input.browserBinding.slice(0, separator)
  );
  if (!tenant) {
    return Promise.resolve(null);
  }
  return repository.consumeGoogleOAuthTransaction({
    stateHash: hashGoogleOAuthSecret(input.state),
    browserBindingHash: hashGoogleOAuthSecret(input.browserBinding),
    tenantSlug: tenant.slug,
    now: input.now ?? new Date(),
  });
}

export function validateGoogleIdTokenClaims(
  claims: Record<string, unknown>,
  input: { clientId: string; nonceHash: string; now?: Date }
): VerifiedGoogleIdentity {
  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (!GOOGLE_OIDC_ISSUERS.includes(claims.iss as (typeof GOOGLE_OIDC_ISSUERS)[number])) {
    throw new Error("google_identity_invalid");
  }
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(input.clientId)) throw new Error("google_identity_invalid");
  if (
    audiences.length > 1 &&
    (typeof claims.azp !== "string" || claims.azp !== input.clientId)
  ) {
    throw new Error("google_identity_invalid");
  }
  if (typeof claims.exp !== "number" || claims.exp <= nowSeconds) {
    throw new Error("google_identity_invalid");
  }
  if (
    typeof claims.nonce !== "string" ||
    !safeHashEquals(hashGoogleOAuthSecret(claims.nonce), input.nonceHash)
  ) {
    throw new Error("google_identity_invalid");
  }
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255) {
    throw new Error("google_identity_invalid");
  }
  if (claims.email_verified !== true || typeof claims.email !== "string") {
    throw new Error("google_identity_invalid");
  }
  const emailNormalized = normalizeCustomerEmail(claims.email);
  if (
    emailNormalized.length > 320 ||
    !/^[^\s@]+@[^\s@]+$/.test(emailNormalized)
  ) {
    throw new Error("google_identity_invalid");
  }
  const displayName =
    typeof claims.name === "string" && claims.name.trim()
      ? claims.name.trim().slice(0, 160)
      : null;
  return {
    subject: claims.sub,
    email: emailNormalized,
    emailNormalized,
    displayName,
  };
}

export async function exchangeGoogleAuthorizationCode(
  configuration: GoogleOAuthConfiguration,
  input: { code: string; codeVerifier: string },
  fetcher: typeof fetch = fetch
) {
  const response = await fetcher(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: input.code,
      client_id: configuration.clientId,
      client_secret: configuration.clientSecret,
      redirect_uri: configuration.redirectUri,
      grant_type: "authorization_code",
      code_verifier: input.codeVerifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("google_token_exchange_failed");
  const body = (await response.json()) as { id_token?: unknown };
  if (typeof body.id_token !== "string" || !body.id_token) {
    throw new Error("google_token_exchange_failed");
  }
  return body.id_token;
}

export function hashGoogleOAuthSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function pkceChallenge(codeVerifier: string) {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

function randomSecret(bytes: number) {
  return randomBytes(bytes).toString("base64url");
}

function safeHashEquals(left: string, right: string) {
  if (left.length !== right.length) return false;
  return timingSafeEqual(Buffer.from(left), Buffer.from(right));
}
