import CategoryForm from "../_components/CategoryForm";
import { requireTenantAdmin } from "@/lib/admin-auth/server";
import { AdminFormHeader } from "../../_components/AdminFormHeader";

export default async function NewCategoryPage() {
  await requireTenantAdmin();
  return (
    <>
      <AdminFormHeader
        title="Add Category"
        backHref="/admin/categories"
        backLabel="Back to Categories"
      />
      <CategoryForm />
    </>
  );
}
