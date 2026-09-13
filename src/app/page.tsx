import Link from "next/link";

export const metadata = {
  title: "ShopNest",
  description: "Independent stores, one home on ShopNest.",
};

export default function PlatformHomePage() {
  return (
    <main className="container mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">ShopNest</p>
      <h1 className="text-4xl font-bold tracking-tight">A home for independent stores</h1>
      <p className="text-lg text-muted-foreground">Visit your store using its ShopNest address to browse products, manage your account, and shop.</p>
      <nav aria-label="Platform navigation">
        <Link href="/admin/login" className="inline-flex min-h-11 items-center rounded-lg border px-4 font-medium">Platform administrator sign in</Link>
      </nav>
    </main>
  );
}
