import { db } from "@/drizzle/db";
import { PageHeader } from "../../_components/PageHeader";
import ProductForm from "../_components/ProductForm";
import { categories } from "@/drizzle/schema";

export default async function NewProductPage() {
  const categoryList = await db.select().from(categories);

  return (
    <>
      <PageHeader>Add Product</PageHeader>
      <ProductForm categoryList={categoryList} />
    </>
  );
}
