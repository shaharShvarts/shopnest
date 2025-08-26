import { ProductCard } from "@/app/components/ProductCard";
import { ProductPreview } from "../types";

export async function ProductSuspense({
  productsFetcher,
}: {
  productsFetcher: () => Promise<ProductPreview[]>;
}) {
  return (await productsFetcher()).map((product) => (
    <ProductCard key={product.id} {...product} />
  ));
}
