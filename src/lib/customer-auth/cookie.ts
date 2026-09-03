export function shouldUseSecureCustomerCookie(input: {
  origin: string | null;
  forwardedProto: string | null;
  nodeEnv: string | undefined;
}) {
  if (input.origin) {
    try {
      const protocol = new URL(input.origin).protocol;
      if (protocol === "https:") return true;
      if (protocol === "http:") return false;
    } catch {
      // Fall through to trusted proxy information or the safe default.
    }
  }

  const forwardedProtocol = firstForwardedValue(input.forwardedProto);
  if (forwardedProtocol === "https") return true;
  if (forwardedProtocol === "http") return false;
  return input.nodeEnv === "production";
}

export function getCustomerSessionCookieOptions(
  session: { expiresAt: Date; maxAgeSeconds: number },
  request: {
    origin: string | null;
    forwardedProto: string | null;
    nodeEnv: string | undefined;
  }
) {
  return {
    httpOnly: true as const,
    secure: shouldUseSecureCustomerCookie(request),
    sameSite: "lax" as const,
    path: "/",
    expires: session.expiresAt,
  };
}

export function resolveCustomerRequestOrigin(input: {
  origin: string | null;
  forwardedProto: string | null;
  forwardedHost: string | null;
  host: string | null;
  nodeEnv: string | undefined;
}) {
  if (input.origin) {
    try {
      const parsed = new URL(input.origin);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.origin;
      }
    } catch {
      // Fall through to proxy headers.
    }
  }

  const host = firstForwardedValue(input.forwardedHost) || input.host;
  if (!host || /[\s/\\]/.test(host)) {
    throw new Error("Unable to determine a safe customer-auth origin");
  }
  const forwardedProtocol = firstForwardedValue(input.forwardedProto);
  const protocol =
    forwardedProtocol === "http" || forwardedProtocol === "https"
      ? forwardedProtocol
      : input.nodeEnv === "production"
        ? "https"
        : "http";
  return new URL(`${protocol}://${host}`).origin;
}

function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim().toLowerCase() ?? null;
}
