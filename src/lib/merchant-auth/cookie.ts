export function shouldUseSecureMerchantCookie(input: {
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

export function getMerchantSessionCookieOptions(
  session: { expiresAt: Date; maxAgeSeconds: number },
  request: {
    origin: string | null;
    forwardedProto: string | null;
    nodeEnv: string | undefined;
  }
) {
  return {
    httpOnly: true as const,
    secure: shouldUseSecureMerchantCookie(request),
    sameSite: "lax" as const,
    path: "/",
    expires: session.expiresAt,
  };
}

function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim().toLowerCase() ?? null;
}
