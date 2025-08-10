import { Nav, NavLink } from "../components/Nav";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin",
  description: "Admin",
};

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Nav>
        {/* <NavLink href="/admin">Dashboard</NavLink> */}
        <NavLink href="/admin/categories">Categories</NavLink>
        <NavLink href="/admin/subcategories">Subcategories</NavLink>
        <NavLink href="/admin/products">Products</NavLink>
        <NavLink href="/admin/users">Customers</NavLink>
        <NavLink href="/admin/orders">Sales</NavLink>
      </Nav>
      <div className="mx-auto px-4 max-w-screen-xl my-6">{children}</div>
    </>
  );
}
