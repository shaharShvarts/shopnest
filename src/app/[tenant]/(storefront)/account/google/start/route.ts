import { NextRequest, NextResponse } from "next/server";
import { requireActiveTenantStorefront } from "@/lib/admin-auth/server";
import { shouldUseSecureCustomerCookie } from "@/lib/customer-auth/cookie";
import { resolveSafeTenantCallback } from "@/lib/customer-auth/core";
import { getGoogleOAuthConfiguration } from "@/lib/customer-auth/google-config";
import {
  beginGoogleOAuth,
  GOOGLE_OAUTH_BINDING_COOKIE,
} from "@/lib/customer-auth/google-oauth";
import { getCustomerAuthRepository } from "@/lib/customer-auth/server";
import { getTenant } from "@/lib/tenant-context";

export async function GET(request: NextRequest) {
  const tenant = await getTenant();
  if (!tenant) return new NextResponse("Not Found", { status: 404 });
  try {
    await requireActiveTenantStorefront();
  } catch {
    return new NextResponse("Store unavailable", { status: 403 });
  }

  const configuration = getGoogleOAuthConfiguration(
    request.headers,
    request.nextUrl.origin
  );
  if (!configuration) {
    return NextResponse.redirect(
      new URL(`${tenant.basePath}/account/login?oauth=unavailable`, request.url)
    );
  }

  try {
    const callbackPath = resolveSafeTenantCallback(
      request.nextUrl.searchParams.get("callback"),
      tenant.basePath
    ).slice(0, 2048);
    const transaction = await beginGoogleOAuth(
      getCustomerAuthRepository(),
      {
        configuration,
        tenantSlug: tenant.slug,
        callbackPath,
      }
    );
    const response = NextResponse.redirect(transaction.authorizationUrl);
    response.cookies.set(GOOGLE_OAUTH_BINDING_COOKIE, transaction.browserBinding, {
      httpOnly: true,
      secure: shouldUseSecureCustomerCookie({
        origin: directRequestOrigin(request),
        forwardedProto: request.headers.get("x-forwarded-proto"),
        nodeEnv: process.env.NODE_ENV,
      }),
      sameSite: "lax",
      path: "/api/customer-auth/google/callback",
      expires: transaction.expiresAt,
    });
    return response;
  } catch {
    return NextResponse.redirect(
      new URL(`${tenant.basePath}/account/login?oauth=failed`, request.url)
    );
  }
}

function directRequestOrigin(request: NextRequest) {
  return request.headers.get("x-forwarded-proto")
    ? request.headers.get("origin")
    : request.headers.get("origin") ?? request.nextUrl.origin;
}
