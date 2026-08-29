export function hashAdminPassword(password: string): Promise<string>;
export function verifyAdminPassword(
  password: string,
  encodedHash: string
): Promise<boolean>;
