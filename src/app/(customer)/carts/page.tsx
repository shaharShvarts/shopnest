import { eq } from "drizzle-orm";
import { getDb } from "@/drizzle/db";
import { fetchCartId } from "../_actions/cartVerification";
import { cartProducts, products } from "@/drizzle/schema";
import CartTable from "../components/CartTable";
import { getTranslations } from "next-intl/server";
import { StorefrontPageHeader } from "../components/StorefrontPageHeader";
import { getTenant } from "@/lib/tenant-context";

export async function generateMetadata() {
  const Metadata = await getTranslations("CartPage.Metadata");

  return {
    title: Metadata("title"),
    description: Metadata("description"),
  };
}

export type CartPageProps = {
  id: number;
  name: string;
  price: number;
  description: string | null;
  quantity: number;
  imageUrl: string;
};

export default async function CartPage() {
  const t = await getTranslations("CartPage");
  const tenant = await getTenant();
  const db = await getDb();
  const cartId = await fetchCartId();
  if (!cartId) return null;

  const cartData: CartPageProps[] = await db
    .select({
      id: products.id,
      name: products.name,
      price: products.price,
      description: products.description,
      quantity: cartProducts.quantity,
      imageUrl: products.imageUrl,
    })
    .from(cartProducts)
    .innerJoin(products, eq(cartProducts.productId, products.id))
    .where(eq(cartProducts.cartId, cartId));

  return (
    <>
      <StorefrontPageHeader>{t("header")}</StorefrontPageHeader>
      <CartTable cartData={cartData} tenantSlug={tenant?.slug ?? ""} />
    </>
  );
}
