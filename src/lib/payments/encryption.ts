import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  PaymentError,
  type PaymentEnvironment,
  type ProviderId,
} from "./types.ts";

export type CredentialContext = {
  tenant: string;
  provider: ProviderId;
  environment: PaymentEnvironment;
};
function key() {
  const value = process.env.PAYMENT_ENCRYPTION_KEY;
  if (!value || !/^[A-Za-z0-9+/]{43}=$/.test(value))
    throw new PaymentError("encryption_not_configured");
  const decoded = Buffer.from(value, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== value)
    throw new PaymentError("encryption_not_configured");
  return decoded;
}
function aad(context: CredentialContext) {
  return Buffer.from(
    JSON.stringify([
      "shopnest-payments-v1",
      context.tenant,
      context.provider,
      context.environment,
    ]),
  );
}
export function encryptCredentials(
  value: Record<string, string>,
  context: CredentialContext,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(aad(context));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64"),
    cipher.getAuthTag().toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}
export function decryptCredentials(
  value: string,
  context: CredentialContext,
): Record<string, string> {
  const secretKey = key();
  try {
    const [version, iv, tag, ciphertext, extra] = value.split(".");
    if (
      version !== "v1" ||
      extra !== undefined ||
      !ciphertext ||
      Buffer.from(iv, "base64").length !== 12 ||
      Buffer.from(tag, "base64").length !== 16
    )
      throw new Error();
    const decipher = createDecipheriv(
      "aes-256-gcm",
      secretKey,
      Buffer.from(iv, "base64"),
    );
    decipher.setAAD(aad(context));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const decoded: unknown = JSON.parse(
      Buffer.concat([
        decipher.update(Buffer.from(ciphertext, "base64")),
        decipher.final(),
      ]).toString("utf8"),
    );
    if (
      !decoded ||
      typeof decoded !== "object" ||
      Array.isArray(decoded) ||
      Object.values(decoded).some((entry) => typeof entry !== "string")
    )
      throw new Error();
    return decoded as Record<string, string>;
  } catch {
    throw new PaymentError("credentials_unavailable");
  }
}
