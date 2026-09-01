export function hashSecurePassword(
  password: string,
  label?: string
): Promise<string>;
export function verifySecurePassword(
  password: string,
  encodedHash: string
): Promise<boolean>;
