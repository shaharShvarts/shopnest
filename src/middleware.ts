import { nanoid } from "nanoid";
import { NextRequest, NextResponse } from "next/server";
import { isValidPassword } from "./lib/isValidPassword";

export async function middleware(req: NextRequest) {
  const url = req.nextUrl.pathname;
  const response = NextResponse.next();

  // 🔐 Admin auth
  if (url.startsWith("/admin")) {
    if (!(await isAuthenticated(req))) {
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: {
          "WWW-Authenticate": "Basic realm='Secure Area', charset='UTF-8'",
        },
      });
    }
    return response;
  }

  // 🛒 Session ID setup for public routes
  const sessionId = req.cookies.get("session_id")?.value;
  if (!sessionId) {
    response.cookies.set("session_id", nanoid(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  return response;
}

async function isAuthenticated(req: NextRequest) {
  const authHeader =
    req.headers.get("authorization") || req.headers.get("Authorization");
  if (!authHeader) return false;

  const [username, password] = Buffer.from(authHeader.split(" ")[1], "base64")
    .toString()
    .split(":");

  return (
    username === process.env.ADMIN_USERNAME &&
    (await isValidPassword(password, process.env.HASHED_ADMIN_PASSWORD!))
  );
}

export const config = {
  // matcher: ["/admin/:path*", "/((?!api|_next|.*\\..*).*)"],
  matcher: ["/admin/:path*", "/((?!_next|api|static|favicon.ico).*)"],
};
