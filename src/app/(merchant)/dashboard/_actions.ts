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


export async function setDashboardLocaleAction(locale: "he" | "en") {
  if (locale !== "he" && locale !== "en") {
    throw new Error("Unsupported locale");
  }

  const cookieStore = await cookies();
  cookieStore.set("SHOPNEST_LOCALE", locale, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
