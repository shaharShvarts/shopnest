import { AdminLoginForm } from "@/app/[tenant]/admin/_components/AdminLoginForm";

export default function SuperAdminLoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-950">
      <section className="w-full max-w-md space-y-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="text-center">
          <h1 className="text-2xl font-semibold">ShopNest</h1>
          <p className="mt-1 text-sm text-slate-600">Administration Login</p>
        </header>
        <AdminLoginForm mode="super" />
      </section>
    </main>
  );
}
