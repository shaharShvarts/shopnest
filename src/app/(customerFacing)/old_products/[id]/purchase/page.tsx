// import { db } from "@/drizzle/db";
// import { products } from "@/drizzle/schema";
// import { eq } from "drizzle-orm";
// import { notFound } from "next/navigation";
// import { ProductPreview } from "../page";

// export default async function PurchasePage({
//   params,
// }: {
//   params: Promise<{ id: string }>;
// }) {
//   const { id } = await params;
//   const result: ProductPreview[] = await db
//     .select({
//       id: products.id,
//       name: products.name,
//       description: products.description,
//       price: products.price,
//       imageUrl: products.imageUrl,
//     })
//     .from(products)
//     .where(eq(products.id, Number(id)))
//     .limit(1);

//   const product = result[0] ?? null;
//   if (!product) notFound();

//   return (
//     <div className="flex items-center justify-center h-screen">
//       <h1 className="text-2xl font-bold">Purchase Page {product.name}</h1>
//     </div>
//   );
// }
