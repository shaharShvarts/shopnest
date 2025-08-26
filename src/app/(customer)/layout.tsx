import { CartProvider } from "@/context/CartContext";
import { Nav, NavLink } from "../components/Nav";
import { CartIcon } from "./components/CartIcon";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Home Page",
  description: "Home Page",
};

export default function HomeLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <CartProvider>
      <Nav>
        <NavLink href="/">Home</NavLink>
        <NavLink href="/categories">Categories</NavLink>
        <NavLink href="/orders">My Orders</NavLink>
        <CartIcon />
      </Nav>
      <div className="mx-auto px-4 max-w-screen-xl my-6">{children}</div>
    </CartProvider>
  );
}
