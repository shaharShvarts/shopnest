// import { ProductCard, ProductCardSkeleton } from "@/app/components/ProductCard";
// import { db } from "@/drizzle/db";
// import { Product, products } from "@/drizzle/schema";
// import { cache } from "@/lib/cache";
// import { eq, desc } from "drizzle-orm";
// import { Suspense } from "react";

// export type ProductPreview = Pick<
//   Product,
//   "id" | "name" | "description" | "price" | "imageUrl"
// >;

// const getProducts = async (id: number): Promise<ProductPreview | null> => {
//   const result: ProductPreview[] = await db
//     .select({
//       id: products.id,
//       name: products.name,
//       description: products.description,
//       price: products.price,
//       imageUrl: products.imageUrl,
//     })
//     .from(products)
//     .where(eq(products.id, id))
//     .limit(1);

//   return result[0] ?? null;
// };

// // const getProducts = cache(
// //   async (id: number) => {
// //     const result: ProductPreview[] = await db
// //       .select({
// //         id: products.id,
// //         name: products.name,
// //         description: products.description,
// //         price: products.price,
// //         imageUrl: products.imageUrl,
// //       })
// //       .from(products)
// //       .where(eq(products.categoryId, Number(id)));
// //     return result;
// //   },
// //   ["/products", "getProducts"],
// //   { revalidate: 60 * 60 * 24 }
// // ); // 24 hours

// export default async function ProductsPage({
//   params,
// }: {
//   params: Promise<{ id: number }>;
// }) {
//   const { id } = await params;

//   return (
//     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
//       <Suspense
//         fallback={Array.from({ length: 6 }).map((_, index) => (
//           <ProductCardSkeleton key={index} />
//         ))}
//       >
//         <ProductsSuspense id={id} />
//       </Suspense>
//     </div>
//   );
// }

// function ProductsSuspense({ id }: { id: number }) {
//   const productPromise = getProducts(id);

//   return (
//     <Suspense fallback={<ProductCardSkeleton />}>
//       <ProductRenderer promise={productPromise} />
//     </Suspense>
//   );
// }

// async function ProductRenderer({
//   promise,
// }: {
//   promise: Promise<ProductPreview | null>;
// }) {
//   const product = await promise;
//   if (!product) return null;

//   return <ProductCard key={product.id} {...product} />;
// }

// // export default async function ProductsPage({
// //   params,
// // }: {
// //   params: Promise<{ id: number }>;
// // }) {
// //   const { id } = await params;

// //   return (
// //     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
// //       <Suspense
// //         fallback={Array.from({ length: 6 }).map((_, index) => (
// //           <ProductCardSkeleton key={index} />
// //         ))}
// //       >
// //         <ProductsSuspense id={id} />
// //       </Suspense>
// //     </div>
// //   );
// // }

// // async function ProductsSuspense({ id }: { id: number }) {
// //   const products = await getProducts(id);
// //   return products.map((product: ProductPreview) => (
// //     <ProductCard key={product.id} {...product} />
// //   ));
// // }
