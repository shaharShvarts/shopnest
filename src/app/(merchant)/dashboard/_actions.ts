"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  logoutMerchantToken,
  MERCHANT_SESSION_COOKIE,
} from "@/lib/merchant-auth/server";

export async function logoutMerchantAction() {
  const cookieStore = await cookies();
  await logoutMerchantToken(cookieStore.get(MERCHANT_SESSION_COOKIE)?.value);
  cookieStore.delete(MERCHANT_SESSION_COOKIE);
  redirect("/login");
}
