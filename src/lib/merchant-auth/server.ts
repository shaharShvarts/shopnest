import "server-only";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  logoutMerchant,
  resolveMerchantSession,
  type MerchantPrincipal,
} from "./core";
import { DrizzleMerchantAuthRepository } from "./drizzle-repository";

export const MERCHANT_SESSION_COOKIE = "shopnest_merchant_session";

const repository = new DrizzleMerchantAuthRepository();

export async function getCurrentMerchant(): Promise<MerchantPrincipal | null> {
  const token = (await cookies()).get(MERCHANT_SESSION_COOKIE)?.value;
  return resolveMerchantSession(repository, token);
}

export async function requireMerchantPage() {
  const merchant = await getCurrentMerchant();
  if (!merchant) redirect("/login");
  return merchant;
}

export function resolveMerchantToken(token: string | null | undefined) {
  return resolveMerchantSession(repository, token);
}

export function logoutMerchantToken(token: string | null | undefined) {
  return logoutMerchant(repository, token);
}

export function getMerchantAuthRepository() {
  return repository;
}
