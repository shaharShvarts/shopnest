"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDbForTenant } from "@/drizzle/db";
import {
  authenticateCustomer,
  createCustomerSession,
  CUSTOMER_PASSWORD_MIN_LENGTH,
  registerCustomer,
  resolveSafeTenantCallback,
} from "@/lib/customer-auth/core";
import {
  CUSTOMER_SESSION_COOKIE,
  getCustomerAuthRepository,
  logoutCustomerToken,
} from "@/lib/customer-auth/server";
import { linkGuestCartToCustomer } from "@/lib/customer-commerce/cart-link";
import { DrizzleCustomerCartLinkStore } from "@/lib/customer-commerce/drizzle-cart-link";
import { getTenant } from "@/lib/tenant-context";

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
  callback: z.string().optional(),
});

const registerSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    email: z.string().trim().email().max(320),
    password: z.string().min(CUSTOMER_PASSWORD_MIN_LENGTH).max(256),
    passwordConfirmation: z.string(),
    callback: z.string().optional(),
  })
  .refine((value) => value.password === value.passwordConfirmation, {
    path: ["passwordConfirmation"],
    message: "Passwords do not match",
  });

export type CustomerAuthActionState = {
  success: false;
  message?:
    | "invalidCredentials"
    | "storeUnavailable"
    | "signInUnavailable"
    | "invalidAccountDetails"
    | "accountUnavailable"
    | "accountCreatedSignInFailed";
  errors?: Record<string, string[] | undefined>;
};

export async function loginCustomerAction(
  _state: CustomerAuthActionState,
  formData: FormData
): Promise<CustomerAuthActionState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { success: false, message: "invalidCredentials" };
  }
  const tenant = await getTenant();
  if (!tenant) return { success: false, message: "storeUnavailable" };

  const repository = getCustomerAuthRepository();
  const customer = await authenticateCustomer(
    repository,
    parsed.data.email,
    parsed.data.password
  );
  if (!customer) {
    return { success: false, message: "invalidCredentials" };
  }

  const cookieStore = await cookies();
  const guestSessionId = cookieStore.get("session_id")?.value;
  let linkResult;
  try {
    await repository.upsertTenantMembership({
      customerId: customer.id,
      tenantSlug: tenant.slug,
      seenAt: new Date(),
    });
    linkResult = await linkGuestCartToCustomer(
      new DrizzleCustomerCartLinkStore(getDbForTenant(tenant)),
      { customerId: customer.id, guestSessionId }
    );
  } catch {
    return {
      success: false,
      message: "signInUnavailable",
    };
  }

  await logoutCustomerToken(
    cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value
  );
  const session = await createCustomerSession(repository, customer.id);
  setCustomerSessionCookie(cookieStore, session);
  redirect(
    linkResult.adjustments.length > 0
      ? `${tenant.basePath}/carts?merge=adjusted`
      : resolveSafeTenantCallback(parsed.data.callback, tenant.basePath)
  );
}

export async function registerCustomerAction(
  _state: CustomerAuthActionState,
  formData: FormData
): Promise<CustomerAuthActionState> {
  const parsed = registerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      success: false,
      message: "invalidAccountDetails",
    };
  }
  const tenant = await getTenant();
  if (!tenant) return { success: false, message: "storeUnavailable" };

  const repository = getCustomerAuthRepository();
  let customer;
  try {
    customer = await registerCustomer(repository, {
      email: parsed.data.email,
      password: parsed.data.password,
      displayName: parsed.data.name,
    });
  } catch {
    return {
      success: false,
      message: "accountUnavailable",
    };
  }

  const cookieStore = await cookies();
  let linkResult;
  try {
    await repository.upsertTenantMembership({
      customerId: customer.id,
      tenantSlug: tenant.slug,
      seenAt: new Date(),
    });
    linkResult = await linkGuestCartToCustomer(
      new DrizzleCustomerCartLinkStore(getDbForTenant(tenant)),
      {
        customerId: customer.id,
        guestSessionId: cookieStore.get("session_id")?.value,
      }
    );
  } catch {
    return {
      success: false,
      message: "accountCreatedSignInFailed",
    };
  }

  await logoutCustomerToken(
    cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value
  );
  const session = await createCustomerSession(repository, customer.id);
  setCustomerSessionCookie(cookieStore, session);
  redirect(
    linkResult.adjustments.length > 0
      ? `${tenant.basePath}/carts?merge=adjusted`
      : resolveSafeTenantCallback(parsed.data.callback, tenant.basePath)
  );
}

export async function logoutCustomerAction() {
  const tenant = await getTenant();
  const cookieStore = await cookies();
  await logoutCustomerToken(cookieStore.get(CUSTOMER_SESSION_COOKIE)?.value);
  cookieStore.delete(CUSTOMER_SESSION_COOKIE);
  redirect(tenant?.basePath || "/");
}

function setCustomerSessionCookie(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  session: { token: string; expiresAt: Date }
) {
  cookieStore.set(CUSTOMER_SESSION_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: session.expiresAt,
  });
}
