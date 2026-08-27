import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";
import { isValidPassword } from "./lib/isValidPassword";
import {
  normalizeTenantSlug,
  TENANT_HEADER,
  TENANT_SCHEMA_HEADER,
} from "./lib/tenant";

const LEGACY_ROUTE_SEGMENTS = new Set([
  "admin",
  "api",
  "carts",
  "categories",
  "checkout",
  "login",
  "privacy-policy",
  "products",
  "shipping",
]);

export async function middleware(req: NextRequest) {
  const tenantRoute = resolveTenantRoute(req.nextUrl.pathname);
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

function resolveTenantRoute(pathname: string) {
  const [firstSegment, ...rest] = pathname.split("/").filter(Boolean);

  if (!firstSegment || LEGACY_ROUTE_SEGMENTS.has(firstSegment)) return null;

  const tenant = normalizeTenantSlug(firstSegment);
  if (!tenant) return null;

  return {
    tenant,
    internalPath: rest.length === 0 ? "/" : `/${rest.join("/")}`,
  };
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
