import type { Metadata } from "next";

import { Montserrat } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import ToastProvider from "./components/ToastProvider";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";

const montserrat = Montserrat({
  variable: "--font-sans",
  weight: ["400", "700"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ShopNest",
    template: "%s | ShopNest",
  },
  description: "Build and prepare your online store with ShopNest, then publish when it is ready.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const messages = await getMessages();
  const locale = await getLocale();

  return (
    <html lang={locale} dir={locale === "he" ? "rtl" : "ltr"}>
      <body
        className={cn(
          "bg-background min-h-screen flex flex-col font-sans antialiased",
          montserrat.variable
        )}
      >
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
        <ToastProvider />
      </body>
    </html>
  );
}
