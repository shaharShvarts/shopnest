import { headers } from "next/headers";
import { Nav, NavLink } from "../components/Nav";
import { Button } from "@/components/ui/button";
import { logoutCurrentAdmin } from "./_actions/auth";
import { requireTenantAdmin } from "@/lib/admin-auth/server";
import { INTERNAL_PATH_HEADER } from "@/lib/tenant";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin",
  description: "Admin",
};

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const internalPath = (await headers()).get(INTERNAL_PATH_HEADER);
  if (internalPath === "/admin/login") return children;

  await requireTenantAdmin();
  const paymentT = await getTranslations("Payments");

  return (
    <>
      <Nav>
        <NavLink href="/admin">Dashboard</NavLink>
        <NavLink href="/admin/categories">Categories</NavLink>
        <NavLink href="/admin/subcategories">Subcategories</NavLink>
        <NavLink href="/admin/products">Products</NavLink>
        <NavLink href="/admin/shipping">Shipping</NavLink>
        <NavLink href="/admin/payments">{paymentT("title")}</NavLink>
        <NavLink href="/admin/users">Customers</NavLink>
        <NavLink href="/admin/orders">Sales</NavLink>
        <form action={logoutCurrentAdmin} className="flex items-center ml-4">
          <Button type="submit" variant="secondary">Logout</Button>
        </form>
      </Nav>
      <div className="mx-auto px-4 container my-6">{children}</div>
    </>
  );
}
