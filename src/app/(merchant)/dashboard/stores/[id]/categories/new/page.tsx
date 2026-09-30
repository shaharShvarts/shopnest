import Link from "next/link";
import { notFound } from "next/navigation";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { requireStoreManagementDb } from "@/lib/store-management/server";
import { ManagedCategoryForm } from "../../_components/ManagedCategoryForm";

export default async function NewManagedCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let storeId: number;
  try {
    storeId = parseStoreId((await params).id);
  } catch {
    notFound();
  }

  const { store } = await requireStoreManagementDb(storeId, "catalog.manage");

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <Link
        href={`/dashboard/stores/${storeId}/categories`}
        className="text-sm font-semibold underline underline-offset-4"
      >
        Back to categories
      </Link>
      <header className="mb-6 mt-4">
        <p className="text-sm text-muted-foreground">{store.displayName}</p>
        <h1 className="text-3xl font-bold tracking-tight">Add category</h1>
      </header>
      <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <ManagedCategoryForm storeId={storeId} />
      </section>
    </main>
  );
}
