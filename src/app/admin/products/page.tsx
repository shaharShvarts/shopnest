import Link from "next/link";
import { Suspense } from "react";
import { db } from "@/drizzle/db";
import AdminLoading from "../loading";
import { count, eq } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../../components/PageHeader";
import { ProductTable } from "./_components/ProductTable";
import { orders, products } from "@/drizzle/schema";

export type ProductData = {
  productsId: number;
  isActive: boolean;
  name: string;
  price: number;
  ordersCount: number;
};

export default async function AdminProductsPage() {
  const productData: ProductData[] = await db
    .select({
      name: products.name,
      price: products.price,
      productsId: products.id,
      isActive: products.isActive,
      ordersCount: count(orders.id).as("ordersCount"),
    })
    .from(products)
    .leftJoin(orders, eq(orders.id, products.id))
    .groupBy(products.name, products.price, products.id, products.isActive)
    .orderBy(products.name);

  return (
    <>
      <div className="flex justify-between items-center gap-4">
        <PageHeader>Products</PageHeader>
        <Button asChild>
          <Link href="/admin/products/new">Add Product</Link>
        </Button>
      </div>
      <Suspense fallback={<AdminLoading />}>
        <ProductTable productData={productData} />
      </Suspense>
    </>
  );
}
