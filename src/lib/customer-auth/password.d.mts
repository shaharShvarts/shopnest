export function hashCustomerPassword(password: string): Promise<string>;
export function verifyCustomerPassword(
  password: string,
  encodedHash: string
): Promise<boolean>;
