import { TenantLink as Link } from "@/components/TenantLink";
import { Suspense } from "react";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import AdminLoading from "../loading";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../../components/PageHeader";
import { ProductTable } from "./_components/ProductTable";
import { orderProducts, products } from "@/drizzle/schema";
import { countOrdersByProduct } from "@/lib/catalog/counts";

export type ProductData = {
  productsId: number;
  isActive: boolean;
  name: string;
  price: number;
  ordersCount: number;
};

export default async function AdminProductsPage() {
  const { db } = await requireTenantAdminDb();
  const [productRows, orderRelations] = await Promise.all([
    db
      .select({
        name: products.name,
        price: products.price,
        productsId: products.id,
        isActive: products.isActive,
      })
      .from(products)
      .orderBy(products.name),
    db.select({ productId: orderProducts.productId }).from(orderProducts),
  ]);
  const orderCounts = countOrdersByProduct(orderRelations);
  const productData: ProductData[] = productRows.map((product) => ({
    ...product,
    ordersCount: orderCounts.get(product.productsId) ?? 0,
  }));

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
