import { db } from "@/drizzle/db";
import { products } from "@/drizzle/schema";
import { desc, eq } from "drizzle-orm";
import ProductDetails from "../../_components/ProductDetails";
import { ProductPreview } from "@/app/(customer)/types";

type Params = {
  params: Promise<{ id: string }>;
};

const fetchProductById = async (id: string) => {
  const [product] = await db
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
  return product;
};

export type fetchedProduct = Awaited<ReturnType<typeof fetchProductById>>;

export default async function PurchasePage({ params }: Params) {
  const { id } = await params;
  const product = await fetchProductById(id);

  return <ProductDetails product={product} />;
}
