import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";
import { isValidPassword } from "./lib/isValidPassword";
import {
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

  if (tenantRoute) {
    requestHeaders.set(TENANT_HEADER, tenantRoute.tenant.slug);
    requestHeaders.set(TENANT_SCHEMA_HEADER, tenantRoute.tenant.schema);
  } else {
    requestHeaders.delete(TENANT_HEADER);
    requestHeaders.delete(TENANT_SCHEMA_HEADER);
  }

  if (internalPath === "/admin" || internalPath.startsWith("/admin/")) {
    if (!(await isAuthenticated(req))) {
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": "Basic realm='Secure Area', charset='UTF-8'",
        },
      });
    }
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

async function isAuthenticated(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Basic ")) return false;

  const encodedCredentials = authHeader.slice("Basic ".length).trim();

  try {
    const [username, password] = Buffer.from(encodedCredentials, "base64")
      .toString()
      .split(":");

    if (!username || password === undefined) return false;

    return (
      username === process.env.ADMIN_USERNAME &&
      (await isValidPassword(password, process.env.HASHED_ADMIN_PASSWORD!))
    );
  } catch {
    return false;
  }
}

export const config = {
  matcher: ["/((?!_next|static|favicon.ico|.*\\..*).*)"],
};
