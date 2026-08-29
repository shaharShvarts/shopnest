import { AdminLoginForm } from "@/app/admin/_components/AdminLoginForm";

export default function SuperAdminLoginPage() {
  return (
    <main className="min-h-screen grid place-items-center p-6">
      <section className="w-full max-w-md rounded border p-6 space-y-5">
        <header className="text-center">
          <h1 className="text-2xl font-semibold">ShopNest</h1>
          <p className="text-muted-foreground">Administration Login</p>
        </header>
        <AdminLoginForm mode="super" />
      </section>
    </main>
  );
}
