import "server-only";

import { cookies } from "next/headers";
import {
  logoutCustomer,
  resolveCustomerSession,
  type CustomerPrincipal,
} from "./core";
import { DrizzleCustomerAuthRepository } from "./drizzle-repository";

export const CUSTOMER_SESSION_COOKIE = "shopnest_customer_session";
const repository = new DrizzleCustomerAuthRepository();

export async function getCurrentCustomer(): Promise<CustomerPrincipal | null> {
  const token = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
  return resolveCustomerSession(repository, token);
}

export function resolveCustomerToken(token: string | null | undefined) {
  return resolveCustomerSession(repository, token);
}

export function logoutCustomerToken(token: string | null | undefined) {
  return logoutCustomer(repository, token);
}

export function getCustomerAuthRepository() {
  return repository;
}
