import "server-only";

import { cookies } from "next/headers";
import { CUSTOMER_SESSION_COOKIE, resolveCustomerToken } from "@/lib/customer-auth/server";

export type CommerceIdentity = {
  customerAccountId: number | null;
  userId: number | null;
  sessionId: string | null;
};

export async function getCommerceIdentity(): Promise<CommerceIdentity> {
  const cookieStore = await cookies();
  const customer = await resolveCustomerToken(
    cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value
  );
  if (customer) {
    return {
      customerAccountId: customer.id,
      userId: null,
      sessionId: null,
    };
  }

  const rawUserId = cookieStore.get("user_id")?.value;
  const parsedUserId = rawUserId ? Number(rawUserId) : null;
  const userId =
    parsedUserId && Number.isSafeInteger(parsedUserId) && parsedUserId > 0
      ? parsedUserId
      : null;
  return {
    customerAccountId: null,
    userId,
    sessionId: cookieStore.get("session_id")?.value?.trim() || null,
  };
}

export function commerceOwnerKey(identity: CommerceIdentity) {
  if (identity.customerAccountId) {
    return `customer:${identity.customerAccountId}`;
  }
  if (identity.userId) return `user:${identity.userId}`;
  if (identity.sessionId) return `session:${identity.sessionId}`;
  return null;
}
