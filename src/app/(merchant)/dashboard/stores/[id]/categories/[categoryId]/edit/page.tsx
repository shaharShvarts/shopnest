import Link from "next/link";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { categories } from "@/drizzle/schema";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { requireStoreManagementDb } from "@/lib/store-management/server";
import { ManagedCategoryForm } from "../../../_components/ManagedCategoryForm";

export default async function EditManagedCategoryPage({
  params,
}: {
  params: Promise<{ id: string; categoryId: string }>;
}) {
  const route = await params;
  let storeId: number;
  const categoryId = Number(route.categoryId);
  try {
    storeId = parseStoreId(route.id);
  } catch {
    notFound();
  }
  if (!Number.isSafeInteger(categoryId) || categoryId <= 0) notFound();

  const { db, store } = await requireStoreManagementDb(
    storeId,
    "catalog.manage"
  );
  const [category] = await db
    .select()
    .from(categories)
    .where(eq(categories.id, categoryId))
    .limit(1);
  if (!category) notFound();

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
        <h1 className="text-3xl font-bold tracking-tight">Edit category</h1>
      </header>
      <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <ManagedCategoryForm storeId={storeId} category={category} />
      </section>
    </main>
  );
}
