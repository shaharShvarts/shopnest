import { db } from "@/drizzle/db";
import { desc, eq } from "drizzle-orm";
import { categories, Product, products } from "@/drizzle/schema";
import { ProductCard } from "@/app/components/ProductCard";
import { ProductPreview } from "@/app/(customerFacing)/types";

export default async function ProductsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [category, productArr] = await Promise.all([
    db
      .select({ name: categories.name })
      .from(categories)
      .where(eq(categories.id, Number(id)))
      .limit(1),
    db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        price: products.price,
        imageUrl: products.imageUrl,
      })
      .from(products)
      .where(eq(products.categoryId, Number(id)))
      .orderBy(desc(products.name)),
  ]);

  const categoryName = category[0]?.name;

  return (
    <>
      <p className="text-3xl font-bold flex justify-end p-5">{categoryName}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ProductsSuspense productArr={productArr} />
      </div>
    </>
  );
}

async function ProductsSuspense({
  productArr,
}: {
  productArr: ProductPreview[];
}) {
  return productArr.map((product) => (
    <ProductCard key={product.id} {...product} />
  ));
}
