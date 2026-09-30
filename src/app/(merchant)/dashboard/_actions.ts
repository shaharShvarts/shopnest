"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logoutAdmin } from "@/lib/admin-auth/core";
import {
  ADMIN_SESSION_COOKIE,
  getAdminAuthRepository,
} from "@/lib/admin-auth/server";
import {
  logoutMerchantToken,
  MERCHANT_SESSION_COOKIE,
} from "@/lib/merchant-auth/server";

export async function logoutDashboardAction() {
  const cookieStore = await cookies();

  await Promise.all([
    logoutMerchantToken(
      cookieStore.get(MERCHANT_SESSION_COOKIE)?.value
    ),
    logoutAdmin(
      getAdminAuthRepository(),
      cookieStore.get(ADMIN_SESSION_COOKIE)?.value
    ),
  ]);

  cookieStore.delete(MERCHANT_SESSION_COOKIE);
  cookieStore.delete(ADMIN_SESSION_COOKIE);
  redirect("/login");
}
