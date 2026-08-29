import { forbidden, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { logoutCurrentAdmin } from "@/app/admin/_actions/auth";
import { AdminAuthorizationError, requireSuperAdmin } from "@/lib/admin-auth/server";

export const dynamic = "force-dynamic";

export default async function ShopNestAdminPage() {
  try {
    const admin = await requireSuperAdmin();
    return (
      <main className="container mx-auto p-6 space-y-5">
        <h1 className="text-3xl font-semibold">ShopNest Administration</h1>
        <p>Signed in as {admin.email}</p>
        <p className="text-muted-foreground">The global control dashboard will be added in a future phase.</p>
        <form action={logoutCurrentAdmin}><Button type="submit">Logout</Button></form>
      </main>
    );
  } catch (error) {
    if (error instanceof AdminAuthorizationError && error.status === 401) redirect("/shopnest/admin/login");
    forbidden();
  }
}
