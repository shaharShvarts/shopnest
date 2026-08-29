import { TenantLink as Link } from "@/components/TenantLink";
import { UserRound } from "lucide-react";
import { CartIcon } from "./components/CartIcon";
import { CartProvider } from "@/context/CartContext";
import LanguageSelector from "../components/LanguageSelector";
import DvorikLogo from "../components/DvorikLogo";
import Footer from "./components/Footer";
import CookieConsent from "./components/CookieConsent";
import { forbidden } from "next/navigation";
import {
  AdminAuthorizationError,
  requireActiveTenantStorefront,
} from "@/lib/admin-auth/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Dvorik Collection",
  description: "Home Page",
};

export default async function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  try {
    await requireActiveTenantStorefront();
  } catch (error) {
    if (error instanceof AdminAuthorizationError && error.status === 403) {
      forbidden();
    }
    throw error;
  }

  return (
    <CartProvider>
      <header
        dir="ltr"
        className="sticky top-0 z-50 bg-white shadow-md"
      >
        <nav className="container mx-auto flex min-w-0 items-center justify-between gap-2 px-3 py-2 sm:gap-4 sm:px-4 sm:py-3">
          <Link
            href={"/"}
            aria-label="ShopNest home"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center"
          >
            <DvorikLogo
              fill="#6D3F03"
              className="size-11 transition-colors hover:fill-[#C2410C] sm:size-16"
            />
          </Link>
          <div className="flex min-w-0 items-center justify-end gap-1 sm:gap-3">
            <LanguageSelector />
            <Link
              href={`/carts`}
              aria-label="View shopping cart"
              className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-500"
            >
              <CartIcon />
            </Link>
            <span
              role="img"
              aria-label="Customer accounts are not available yet"
              title="Customer accounts are not available yet"
              className="flex size-11 shrink-0 items-center justify-center rounded-md text-gray-500"
            >
              <UserRound aria-hidden="true" />
            </span>
          </div>
        </nav>
      </header>
      <div className="min-w-0 flex-grow">
        <main className="container mx-auto min-w-0 px-3 py-4 sm:px-4 sm:py-6">
          {children}
        </main>
      </div>
      <Footer />
      <CookieConsent />
    </CartProvider>
  );
}
