import Link from "next/link";
import { UserRound } from "lucide-react";
import { CartIcon } from "./components/CartIcon";
import { CartProvider } from "@/context/CartContext";
import LanguageSelector from "../components/LanguageSelector";
import DvorikLogo from "../components/DvorikLogo";
import Footer from "./components/Footer";

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
  return (
    <CartProvider>
      <header dir="ltr" className="sticky top-0 bg-white z-50 ltr shadow-md">
        <nav className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            href={"/"}
            className="flex flex-col justify-center items-center"
          >
            <DvorikLogo
              height={64}
              fill="#6D3F03"
              className="hover:fill-[#C2410C] transition-colors"
            />
          </Link>
          <div className="flex items-center justify-between gap-4">
            <LanguageSelector />
            <Link href={`/carts`}>
              <CartIcon />
            </Link>
            <Link href={`/login`}>
              <UserRound className="text-gray-800 hover:text-rose-800" />
            </Link>
          </div>
        </nav>
      </header>
      <div className="flex-grow">
        {" "}
        {/* bg-gradient-to-br from-gray-100 to-gray-400 */}
        <div className="container mx-auto px-4 py-3">{children}</div>
      </div>
      <Footer />
    </CartProvider>
  );
}
// max-w-screen-xl mx-auto my-6
