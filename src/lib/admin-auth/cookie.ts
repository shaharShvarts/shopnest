export function shouldUseSecureAdminCookie(input: {
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
      // Fall through to trusted proxy information or the safe environment default.
    }
  }

  const forwardedProtocol = input.forwardedProto
    ?.split(",", 1)[0]
    ?.trim()
    .toLowerCase();
  if (forwardedProtocol === "https") return true;
  if (forwardedProtocol === "http") return false;

  return input.nodeEnv === "production";
}
