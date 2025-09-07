import { eq } from "drizzle-orm";
import { db } from "@/drizzle/db";
import { fetchCartId } from "../_actions/cartVerification";
import { cartProducts, products } from "@/drizzle/schema";
import CartTable from "../components/CartTable";

export type CartPageProps = {
  id: number;
  name: string;
  price: number;
  description: string | null;
  quantity: number;
};

export default async function CartPage() {
  const cartId = await fetchCartId();
  if (!cartId) return null;

  const cartData: CartPageProps[] = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      description: products.description,
      quantity: cartProducts.quantity,
    })
    .from(cartProducts)
    .innerJoin(products, eq(cartProducts.productId, products.id))
    .where(eq(cartProducts.cartId, cartId));

  return <CartTable cartData={cartData} />;
}
