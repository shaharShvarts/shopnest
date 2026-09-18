import {
  hashSecurePassword,
  verifySecurePassword,
} from "../auth/secure-password.mjs";

export function hashMerchantPassword(password) {
  return hashSecurePassword(password, "Merchant password");
}

export function verifyMerchantPassword(password, encodedHash) {
  return verifySecurePassword(password, encodedHash);
}
