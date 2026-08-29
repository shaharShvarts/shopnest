import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";
import {
  INTERNAL_PATH_HEADER,
  resolveTenantRoute,
  TENANT_HEADER,
  TENANT_SCHEMA_HEADER,
} from "./lib/tenant";

export async function middleware(req: NextRequest) {
  const routeResolution = resolveTenantRoute(req.nextUrl.pathname);

  if (routeResolution.kind === "not-found") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const tenantRoute =
    routeResolution.kind === "tenant" ? routeResolution : null;
  const internalPath = tenantRoute?.internalPath ?? req.nextUrl.pathname;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(INTERNAL_PATH_HEADER, internalPath);

  if (tenantRoute) {
    requestHeaders.set(TENANT_HEADER, tenantRoute.tenant.slug);
    requestHeaders.set(TENANT_SCHEMA_HEADER, tenantRoute.tenant.schema);
  } else {
    requestHeaders.delete(TENANT_HEADER);
    requestHeaders.delete(TENANT_SCHEMA_HEADER);
  }

  const response = tenantRoute
    ? NextResponse.rewrite(new URL(internalPath, req.url), {
        request: { headers: requestHeaders },
      })
    : NextResponse.next({ request: { headers: requestHeaders } });

  if (
    internalPath !== "/admin" &&
    !internalPath.startsWith("/admin/") &&
    !req.cookies.has("session_id")
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
  matcher: [
    "/:tenant/media/:path*",
    "/((?!_next|static|favicon.ico|.*\\..*).*)",
  ],
};
