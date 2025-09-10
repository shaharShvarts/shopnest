import { db } from "@/drizzle/db";
import { desc, eq } from "drizzle-orm";
import { categories, products } from "@/drizzle/schema";
import { ProductCard } from "@/app/components/ProductCard";
import { ProductPreview } from "@/app/(customer)/types";
import { PageHeader } from "@/app/admin/_components/PageHeader";
import { cache } from "@/lib/cache";

type ProductsPageProps = {
  params: Promise<{ id: string }>;
};

export const fetchCategoryWithProducts = cache(
  async (id: number) => {
    const [category, productArr] = await Promise.all([
      db
        .select({ name: categories.name })
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1),
      db
        .select({
          id: products.id,
          name: products.name,
          description: products.description,
          price: products.price,
          imageUrl: products.imageUrl,
          quantity: products.quantity,
        })
        .from(products)
        .where(eq(products.categoryId, id))
        .orderBy(desc(products.name)),
    ]);

    return {
      categoryName: category[0]?.name ?? null,
      products: productArr,
    };
  },
  ["/categories/:id", "getCategoryWithProducts"],
  { revalidate: 60 * 60 * 24 } // 24 hours
);

export type ProductPageProps = Awaited<
  ReturnType<typeof fetchCategoryWithProducts>
>["products"][number];

export default async function ProductsPage({ params }: ProductsPageProps) {
  const { id } = await params;
  const { categoryName, products } = await fetchCategoryWithProducts(
    Number(id)
  );

  return (
    <>
      <PageHeader>{categoryName}</PageHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ProductsSuspense products={products} />
      </div>
    </>
  );
}

type productsProps = {
  products: ProductPageProps[];
};

async function ProductsSuspense({ products }: productsProps) {
  return products.map((product) => (
    <ProductCard key={product.id} {...product} />
  ));
}
