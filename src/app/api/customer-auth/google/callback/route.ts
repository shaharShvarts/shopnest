import { NextRequest, NextResponse } from "next/server";
import { getDbForTenant } from "@/drizzle/db";
import { linkGuestCartToCustomer } from "@/lib/customer-commerce/cart-link";
import { DrizzleCustomerCartLinkStore } from "@/lib/customer-commerce/drizzle-cart-link";
import {
  getCustomerSessionCookieOptions,
  shouldUseSecureCustomerCookie,
} from "@/lib/customer-auth/cookie";
import {
  createCustomerSession,
  resolveSafeTenantCallback,
} from "@/lib/customer-auth/core";
import { getGoogleOAuthConfiguration } from "@/lib/customer-auth/google-config";
import {
  consumeGoogleOAuthState,
  exchangeGoogleAuthorizationCode,
  GOOGLE_OAUTH_BINDING_COOKIE,
  GOOGLE_OAUTH_CALLBACK_PATH,
  GOOGLE_OIDC_ISSUERS,
} from "@/lib/customer-auth/google-oauth";
import { verifyGoogleIdToken } from "@/lib/customer-auth/google-oidc";
import {
  CUSTOMER_SESSION_COOKIE,
  getCustomerAuthRepository,
  logoutCustomerToken,
} from "@/lib/customer-auth/server";
import { resolveConfiguredTenant } from "@/lib/tenant";

export async function GET(request: NextRequest) {
  const repository = getCustomerAuthRepository();
  const browserBinding = request.cookies.get(GOOGLE_OAUTH_BINDING_COOKIE)?.value ?? null;
  let transaction: Awaited<ReturnType<typeof consumeGoogleOAuthState>>;
  try {
    transaction = await consumeGoogleOAuthState(repository, {
      state: request.nextUrl.searchParams.get("state"),
      browserBinding,
    });
  } catch {
    return clearBindingCookie(
      NextResponse.redirect(new URL("/", request.url)),
      request
    );
  }
  if (!transaction) {
    return clearBindingCookie(
      NextResponse.redirect(new URL("/", request.url)),
      request
    );
  }

  const tenant = resolveConfiguredTenant(transaction.tenantSlug);
  if (!tenant) {
    return clearBindingCookie(
      NextResponse.redirect(new URL("/", request.url)),
      request
    );
  }
  const fail = (reason: "cancelled" | "failed" | "invalid") =>
    clearBindingCookie(
      NextResponse.redirect(
        new URL(`${tenant.basePath}/account/login?oauth=${reason}`, request.url)
      ),
      request
    );

  const providerError = request.nextUrl.searchParams.get("error");
  if (providerError) {
    return fail(providerError === "access_denied" ? "cancelled" : "failed");
  }
  const responseIssuer = request.nextUrl.searchParams.get("iss");
  if (
    responseIssuer &&
    !GOOGLE_OIDC_ISSUERS.includes(
      responseIssuer as (typeof GOOGLE_OIDC_ISSUERS)[number]
    )
  ) {
    return fail("invalid");
  }
  const code = request.nextUrl.searchParams.get("code");
  const configuration = getGoogleOAuthConfiguration(
    request.headers,
    request.nextUrl.origin
  );
  if (!code || code.length > 4096 || !configuration) return fail("failed");

  try {
    const idToken = await exchangeGoogleAuthorizationCode(configuration, {
      code,
      codeVerifier: transaction.codeVerifier,
    });
    const identity = await verifyGoogleIdToken(idToken, {
      configuration,
      nonceHash: transaction.nonceHash,
    });
    const customer = await repository.resolveGoogleCustomer({
      ...identity,
      verifiedAt: new Date(),
    });

    await repository.upsertTenantMembership({
      customerId: customer.id,
      tenantSlug: tenant.slug,
      seenAt: new Date(),
    });
    const linkResult = await linkGuestCartToCustomer(
      new DrizzleCustomerCartLinkStore(getDbForTenant(tenant)),
      {
        customerId: customer.id,
        guestSessionId: request.cookies.get("session_id")?.value,
      }
    );
    await logoutCustomerToken(
      request.cookies.get(CUSTOMER_SESSION_COOKIE)?.value
    );
    const session = await createCustomerSession(repository, customer.id);
    const destination =
      linkResult.adjustments.length > 0
        ? `${tenant.basePath}/carts?merge=adjusted`
        : resolveSafeTenantCallback(transaction.callbackPath, tenant.basePath);
    const response = NextResponse.redirect(new URL(destination, request.url));
    response.cookies.set(
      CUSTOMER_SESSION_COOKIE,
      session.token,
      getCustomerSessionCookieOptions(session, {
        origin: directRequestOrigin(request),
        forwardedProto: request.headers.get("x-forwarded-proto"),
        nodeEnv: process.env.NODE_ENV,
      })
    );
    return clearBindingCookie(response, request);
  } catch {
    return fail("failed");
  }
}

function clearBindingCookie(response: NextResponse, request: NextRequest) {
  response.cookies.set(GOOGLE_OAUTH_BINDING_COOKIE, "", {
    httpOnly: true,
    secure: shouldUseSecureCustomerCookie({
      origin: directRequestOrigin(request),
      forwardedProto: request.headers.get("x-forwarded-proto"),
      nodeEnv: process.env.NODE_ENV,
    }),
    sameSite: "lax",
    path: GOOGLE_OAUTH_CALLBACK_PATH,
    maxAge: 0,
  });
  return response;
}

function directRequestOrigin(request: NextRequest) {
  return request.headers.get("x-forwarded-proto")
    ? request.headers.get("origin")
    : request.headers.get("origin") ?? request.nextUrl.origin;
}
