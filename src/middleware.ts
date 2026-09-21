import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";
import {
  buildHostedTenantRewriteUrl,
  buildTenantRewriteUrl,
  INTERNAL_PATH_HEADER,
  isGlobalApiPath,
  isTenantHandlerPath,
  resolveTenantRouteAsync,
  TENANT_HEADER,
  TENANT_ROUTE_MODE_HEADER,
  TENANT_SCHEMA_HEADER,
  type TenantRouteMode,
} from "./lib/tenant-routing/core";
import {
  isPlatformHostname,
  normalizeRequestHostname,
} from "./lib/domain-registry/core";
import { resolveTrustedDomain } from "./lib/domain-registry/server";
import { resolveTrustedTenant } from "./lib/tenant-registry/server";

export async function middleware(req: NextRequest) {
  const incomingHeaders = req.headers ?? new Headers();
  const hostValue =
    incomingHeaders.get("host") ??
    req.nextUrl.host ??
    req.nextUrl.hostname;
  const hostname = normalizeRequestHostname(hostValue);

  if (!hostname) {
    return new NextResponse("Bad Request", { status: 400 });
  }

  let tenantRoute:
    | {
        tenant: Awaited<ReturnType<typeof resolveTrustedTenant>>;
        internalPath: string;
      }
    | null = null;
  let routeMode: TenantRouteMode | null = null;
  let isLegacyRoute = false;

  if (isPlatformHostname(hostname)) {
    let routeResolution;
    try {
      routeResolution = await resolveTenantRouteAsync(
        req.nextUrl.pathname,
        resolveTrustedTenant
      );
    } catch {
      return new NextResponse("Service Unavailable", { status: 503 });
    }

    if (routeResolution.kind === "not-found") {
      return new NextResponse("Not Found", { status: 404 });
    }

    if (routeResolution.kind === "tenant") {
      tenantRoute = routeResolution;
      routeMode = "path";
    } else {
      isLegacyRoute = true;
    }
  } else {
    if (isGlobalApiPath(req.nextUrl.pathname)) {
      return new NextResponse("Not Found", { status: 404 });
    }

    let domain;
    try {
      domain = await resolveTrustedDomain(hostname);
    } catch {
      return new NextResponse("Service Unavailable", { status: 503 });
    }

    if (!domain) {
      return new NextResponse("Not Found", { status: 404 });
    }

    tenantRoute = {
      tenant: domain.tenant,
      internalPath: req.nextUrl.pathname,
    };
    routeMode = "host";
  }

  const internalPath = tenantRoute?.internalPath ?? req.nextUrl.pathname;
  const requestHeaders = new Headers(incomingHeaders);
  requestHeaders.set(INTERNAL_PATH_HEADER, internalPath);

  if (tenantRoute?.tenant && routeMode) {
    requestHeaders.set(TENANT_HEADER, tenantRoute.tenant.slug);
    requestHeaders.set(TENANT_SCHEMA_HEADER, tenantRoute.tenant.schema);
    requestHeaders.set(TENANT_ROUTE_MODE_HEADER, routeMode);
  } else {
    requestHeaders.delete(TENANT_HEADER);
    requestHeaders.delete(TENANT_SCHEMA_HEADER);
    requestHeaders.delete(TENANT_ROUTE_MODE_HEADER);
  }

  let response;
  if (tenantRoute?.tenant && routeMode === "host") {
    response = isTenantHandlerPath(internalPath)
      ? NextResponse.next({ request: { headers: requestHeaders } })
      : NextResponse.rewrite(
          buildHostedTenantRewriteUrl(
            req.nextUrl,
            tenantRoute.tenant,
            internalPath
          ),
          { request: { headers: requestHeaders } }
        );
  } else if (
    tenantRoute?.tenant &&
    routeMode === "path" &&
    isTenantHandlerPath(internalPath)
  ) {
    response = NextResponse.rewrite(
      buildTenantRewriteUrl(req.nextUrl, internalPath),
      { request: { headers: requestHeaders } }
    );
  } else {
    response = NextResponse.next({ request: { headers: requestHeaders } });
  }

  if (
    tenantRoute?.tenant &&
    internalPath !== "/admin" &&
    !internalPath.startsWith("/admin/") &&
    !req.cookies?.has("session_id")
  ) {
    response.cookies.set("session_id", nanoid(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return response;
}

export const config = {
  runtime: "nodejs",
  matcher: [
    "/media/:path*",
    "/:tenant/media/:path*",
    "/((?!_next/|static/|favicon.ico$|[^/]+\\.(?:svg|png|jpg|jpeg|webp|gif|ico|woff|woff2)$).*)",
  ],
};
