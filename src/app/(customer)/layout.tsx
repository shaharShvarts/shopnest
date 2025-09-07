import Link from "next/link";
import { UserRound } from "lucide-react";
import { CartIcon } from "./components/CartIcon";
import { CartProvider } from "@/context/CartContext";
import LanguageSelector from "../components/LanguageSelector";

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
      <header
        dir="ltr"
        className="sticky top-0 border-b border-black/50 bg-white z-50 ltr"
      >
        <nav className="max-w-screen-xl mx-auto py-3 flex items-center justify-between">
          <Link
            href={"/"}
            className="flex flex-col justify-center items-center"
          >
            <h1 className="font-bold text-3xl font-serif text-rose-800">
              Dvorik
            </h1>
            <h2 className="font-bold text-gray-500">⭐ Collection ⭐</h2>
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
      <div className="max-w-screen-xl mx-auto my-6">{children}</div>
    </CartProvider>
  );
}
