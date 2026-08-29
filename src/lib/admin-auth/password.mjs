import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;
const COST = 16384;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const MAX_MEMORY = 64 * 1024 * 1024;

export async function hashAdminPassword(password) {
  if (typeof password !== "string" || password.length < 12) {
    throw new Error("Admin password must contain at least 12 characters");
  }

  const salt = randomBytes(16);
  const derivedKey = await derive(password, salt);
  return [
    "scrypt",
    COST,
    BLOCK_SIZE,
    PARALLELIZATION,
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export async function verifyAdminPassword(password, encodedHash) {
  try {
    const [algorithm, cost, blockSize, parallelization, salt, storedKey] =
      encodedHash.split("$");
    if (
      algorithm !== "scrypt" ||
      Number(cost) !== COST ||
      Number(blockSize) !== BLOCK_SIZE ||
      Number(parallelization) !== PARALLELIZATION
    ) {
      return false;
    }

    const expected = Buffer.from(storedKey, "base64url");
    if (expected.length !== KEY_LENGTH) return false;
    const actual = await derive(password, Buffer.from(salt, "base64url"));
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function derive(password, salt) {
  return scrypt(password, salt, KEY_LENGTH, {
    N: COST,
    r: BLOCK_SIZE,
    p: PARALLELIZATION,
    maxmem: MAX_MEMORY,
  });
}
