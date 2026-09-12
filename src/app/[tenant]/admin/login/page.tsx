import { notFound } from "next/navigation";
import { AdminLoginForm } from "../_components/AdminLoginForm";
import { getControlTenant } from "@/lib/admin-auth/server";
import { getTenant } from "@/lib/tenant-context";

export default async function TenantAdminLoginPage() {
  const tenant = await getTenant();
  if (!tenant) notFound();
  const controlTenant = await getControlTenant(tenant.slug);
  if (!controlTenant) notFound();
  return (
    <main className="min-h-[70vh] grid place-items-center p-6">
      <section className="w-full max-w-md rounded border p-6 space-y-5">
        <header className="text-center">
          <h1 className="text-2xl font-semibold">{controlTenant.displayName}</h1>
          <p className="text-muted-foreground">Admin Login</p>
        </header>
        <AdminLoginForm mode="tenant" />
      </section>
    </main>
  );
}
