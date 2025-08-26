import { db } from "@/drizzle/db";
import { products } from "@/drizzle/schema";
import { desc, eq } from "drizzle-orm";
import ProductDetails from "../../_components/ProductDetails";
import { ProductPreview } from "@/app/(customer)/types";

export default async function PurchasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [product]: ProductPreview[] = await db
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      price: products.price,
      imageUrl: products.imageUrl,
      quantity: products.quantity,
    })
    .from(products)
    .where(eq(products.id, Number(id)))
    .limit(1);

  return <ProductDetails product={product} />;
}
