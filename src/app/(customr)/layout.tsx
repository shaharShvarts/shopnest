import { Nav, NavLink } from "../components/Nav";

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
    <>
      <Nav>
        <NavLink href="/">Home</NavLink>
        <NavLink href="/categories">Categories</NavLink>
        <NavLink href="/orders">My Orders</NavLink>
      </Nav>
      <div className="mx-auto px-4 max-w-screen-xl my-6">{children}</div>
    </>
  );
}
