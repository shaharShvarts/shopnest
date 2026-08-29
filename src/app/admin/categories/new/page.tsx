import { PageHeader } from "../../../components/PageHeader";
import CategoryForm from "../_components/CategoryForm";
import { requireTenantAdmin } from "@/lib/admin-auth/server";

export default async function NewCategoryPage() {
  await requireTenantAdmin();
  return (
    <>
      <PageHeader>Add Category</PageHeader>
      <CategoryForm />
    </>
  );
}
