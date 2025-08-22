import { db } from "@/drizzle/db";
import { Product, products } from "@/drizzle/schema";
import { eq, desc } from "drizzle-orm";
import { ProductCard, ProductCardSkeleton } from "../components/ProductCard";
import { Suspense } from "react";
import { cache } from "@/lib/cache";
import { ProductPreview } from "./types";

const getMostPopularProducts = cache(
  () => {
    return db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        price: products.price,
        imageUrl: products.imageUrl,
        quantity: products.quantity,
      })
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(desc(products.name))
      .limit(6);
  },
  ["/", "getMostPopularProducts"],
  { revalidate: 60 * 60 * 24 }
); // 24 hours

const getMostNewestProducts = cache(
  () => {
    return db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        price: products.price,
        imageUrl: products.imageUrl,
      })
      .from(products)
      .where(eq(products.isActive, true))
      .orderBy(desc(products.name))
      .limit(6);
  },
  ["/", "getMostNewestProducts"],
  { revalidate: 60 * 60 * 24 }
); // 24 hours

export default function HomePage() {
  return (
    <main className="space-y-12">
      <ProductGridSection
        title={"Most Popular"}
        productsFetcher={getMostPopularProducts}
      />
      {/* <ProductGridSection
        title={"Newest"}
        productsFetcher={getMostNewestProducts}
      /> */}
    </main>
  );
}

type ProductGridSectionProps = {
  title: string;
  productsFetcher: () => Promise<ProductPreview[]>;
};

function ProductGridSection({
  title,
  productsFetcher,
}: ProductGridSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex gap-4">
        <h2 className="text-3xl font-bold">{title}</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Suspense
          fallback={Array.from({ length: 6 }).map((_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        >
          <ProductSuspense productsFetcher={productsFetcher} />
        </Suspense>
      </div>
    </div>
  );
}

async function ProductSuspense({
  productsFetcher,
}: {
  productsFetcher: () => Promise<ProductPreview[]>;
}) {
  return (await productsFetcher()).map((product) => (
    <ProductCard key={product.id} {...product} />
  ));
}
