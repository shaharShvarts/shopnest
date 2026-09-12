import { eq } from "drizzle-orm";
import { getDb } from "@/drizzle/db";
import { fetchCartId } from "../_actions/cartVerification";
import { cartProducts, products } from "@/drizzle/schema";
import CartTable from "../components/CartTable";
import { getTranslations } from "next-intl/server";
import { StorefrontPageHeader } from "../components/StorefrontPageHeader";
import { getTenant } from "@/lib/tenant-context";
import { InventoryService } from "@/lib/inventory/core";
import { DrizzleInventoryStore } from "@/lib/inventory/drizzle-store";
import {
  commerceOwnerKey,
  getCommerceIdentity,
} from "@/lib/customer-commerce/identity";

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
  available: number;
};

export default async function CartPage({
  searchParams,
}: {
  searchParams: Promise<{ merge?: string }>;
}) {
  const t = await getTranslations("CartPage");
  const tenant = await getTenant();
  const db = await getDb();
  const cartId = await fetchCartId();
  if (!cartId) return null;

  const rows = await db
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
  const ownerKey = commerceOwnerKey(await getCommerceIdentity());
  if (!ownerKey) return null;
  const availability = await new InventoryService(
    new DrizzleInventoryStore(db)
  ).getAvailabilityBatchForCart(
    rows.map((item) => item.id),
    { ownerKey, cartId }
  );
  const cartData: CartPageProps[] = rows.map((item) => ({
    ...item,
    available: availability.get(item.id)?.available ?? 0,
  }));

  return (
    <>
      <StorefrontPageHeader>{t("header")}</StorefrontPageHeader>
      {(await searchParams).merge === "adjusted" && (
        <p className="mb-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900" role="status">
          Some quantities were adjusted to the stock currently available.
        </p>
      )}
      <CartTable cartData={cartData} tenantSlug={tenant?.slug ?? ""} />
    </>
  );
}
