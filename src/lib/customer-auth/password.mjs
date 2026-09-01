import {
  hashSecurePassword,
  verifySecurePassword,
} from "../auth/secure-password.mjs";

export function hashCustomerPassword(password) {
  return hashSecurePassword(password, "Customer password");
}

export function verifyCustomerPassword(password, encodedHash) {
  return verifySecurePassword(password, encodedHash);
}
