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
import { tenantPath } from "@/lib/tenant-context";
import { SearchForm } from "./search/_components/SearchForm";
import { getTranslations } from "next-intl/server";

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
  const searchAction = await tenantPath("/search");
  const catalogT = await getTranslations("CatalogUX");

  return (
    <CartProvider>
      <header className="sticky top-0 z-50 border-b bg-white/95 shadow-sm backdrop-blur">
        <nav className="container mx-auto flex min-w-0 flex-wrap items-center justify-between gap-2 px-3 py-2 sm:flex-nowrap sm:gap-4 sm:px-4">
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/"
              aria-label="ShopNest home"
              className="group flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-1 font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <DvorikLogo
                fill="currentColor"
                className="size-10 text-amber-900 transition-colors group-hover:text-amber-700 sm:size-12"
              />
              <span className="hidden text-lg tracking-tight md:inline">ShopNest</span>
            </Link>
            <Link
              href="/categories"
              className="hidden min-h-11 items-center rounded-lg px-3 text-sm font-medium text-foreground hover:bg-muted md:flex"
            >
              {catalogT("catalog")}
            </Link>
          </div>
          <div className="order-3 min-w-0 basis-full sm:order-none sm:max-w-xl sm:flex-1">
            <SearchForm action={searchAction} compact />
          </div>
          <div className="flex min-w-0 items-center justify-end gap-1 sm:gap-3">
            <LanguageSelector />
            <Link
              href="/carts"
              aria-label="View shopping cart"
              className="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
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
