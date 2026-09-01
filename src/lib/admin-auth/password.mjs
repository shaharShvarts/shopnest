import {
  hashSecurePassword,
  verifySecurePassword,
} from "../auth/secure-password.mjs";

export async function hashAdminPassword(password) {
  return hashSecurePassword(password, "Admin password");
}

export async function verifyAdminPassword(password, encodedHash) {
  return verifySecurePassword(password, encodedHash);
}
