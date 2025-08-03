import { Nav, NavLink } from "../components/Nav";

export const dynamic = "force-dynamic";

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <>
      <Nav>
        <NavLink href="/admin">Dashboard</NavLink>
        <NavLink href="/admin/categories">Categories</NavLink>
        <NavLink href="/admin/subcategory">Subcategory</NavLink>
        <NavLink href="/admin/products">Products</NavLink>
        <NavLink href="/admin/users">Customers</NavLink>
        <NavLink href="/admin/orders">Sales</NavLink>
      </Nav>
      <div className="mx-auto px-4 max-w-screen-xl my-6">{children}</div>
    </>
  );
}

export const metadata = {
  title: "Admin",
  description: "Admin",
};
