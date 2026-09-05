import "server-only";

import { env } from "@/data/env/server";
import { resolveCustomerRequestOrigin } from "./cookie";
import {
  resolveGoogleOAuthConfiguration,
  type GoogleOAuthConfiguration,
} from "./google-oauth";

export function getGoogleOAuthConfiguration(
  requestHeaders: Headers,
  requestUrlOrigin?: string
): GoogleOAuthConfiguration | null {
  let requestOrigin: string;
  try {
    requestOrigin = resolveCustomerRequestOrigin({
      origin:
        requestHeaders.get("origin") ??
        (requestHeaders.get("x-forwarded-proto") ? null : requestUrlOrigin ?? null),
      forwardedProto: requestHeaders.get("x-forwarded-proto"),
      forwardedHost: requestHeaders.get("x-forwarded-host"),
      host: requestHeaders.get("host"),
      nodeEnv: process.env.NODE_ENV,
    });
  } catch {
    return null;
  }
  return resolveGoogleOAuthConfiguration({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
    requestOrigin,
  });
}
