import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  GOOGLE_JWKS_URI,
  GOOGLE_OIDC_ISSUERS,
  validateGoogleIdTokenClaims,
  type GoogleOAuthConfiguration,
} from "./google-oauth";

const googleJwks = createRemoteJWKSet(new URL(GOOGLE_JWKS_URI));

export async function verifyGoogleIdToken(
  idToken: string,
  input: {
    configuration: GoogleOAuthConfiguration;
    nonceHash: string;
    now?: Date;
  }
) {
  const now = input.now ?? new Date();
  const { payload } = await jwtVerify(idToken, googleJwks, {
    issuer: [...GOOGLE_OIDC_ISSUERS],
    audience: input.configuration.clientId,
    algorithms: ["RS256"],
    currentDate: now,
    clockTolerance: 5,
  });
  return validateGoogleIdTokenClaims(payload, {
    clientId: input.configuration.clientId,
    nonceHash: input.nonceHash,
    now,
  });
}
