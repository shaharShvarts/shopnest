"use server";

import { cookies } from "next/headers";

export async function setShopNestLocaleAction(locale: "he" | "en") {
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
