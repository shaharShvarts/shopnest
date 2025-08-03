import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../_components/PageHeader";
import { CategoryTable } from "./_components/CategoryTable";
import { PageTitle } from "../_components/PageTitle";

export default async function AdminCategoriesPage() {
  return (
    <>
      <div className="flex justify-between items-center gap-4">
        <PageHeader>Categories</PageHeader>
        <Button asChild>
          <Link href="/admin/categories/new">Add Category</Link>
        </Button>
      </div>
      <CategoryTable />
    </>
  );
}
