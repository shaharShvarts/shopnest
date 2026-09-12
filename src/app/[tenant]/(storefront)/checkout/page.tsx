import { StorefrontPageHeader } from "../components/StorefrontPageHeader";
import { randomUUID } from "node:crypto";
import CheckoutTable from "./_components/CheckoutTable";
import { getCurrentCustomer } from "@/lib/customer-auth/server";
import { and, eq, sql } from "drizzle-orm";
import { getTenant } from "@/lib/tenant-context";
import { getDbForTenant } from "@/drizzle/db";
import { cartProducts, carts, products } from "@/drizzle/schema";
import { getCommerceIdentity } from "@/lib/customer-commerce/identity";
import { DrizzleShippingMethodStore } from "@/lib/shipping/drizzle-store";
import { listAvailableShippingMethods } from "@/lib/shipping/core";

export default async function CheckoutPage() {
  const customer = await getCurrentCustomer();
  const tenant = await getTenant();
  const identity = await getCommerceIdentity();
  let itemsSubtotal = 0;
  let shippingMethods: Awaited<ReturnType<typeof listAvailableShippingMethods>> = [];
  if (tenant) {
    const db = getDbForTenant(tenant);
    const owner = identity.customerAccountId
      ? eq(carts.customerAccountId, identity.customerAccountId)
      : identity.userId
        ? eq(carts.userId, identity.userId)
        : eq(carts.sessionId, identity.sessionId!);
    const [subtotal] = await db
      .select({
        value: sql<number>`coalesce(sum(${products.price} * ${cartProducts.quantity}), 0)`,
      })
      .from(carts)
      .innerJoin(cartProducts, eq(cartProducts.cartId, carts.id))
      .innerJoin(products, eq(products.id, cartProducts.productId))
      .where(and(owner, eq(carts.isActive, true)));
    itemsSubtotal = Number(subtotal?.value ?? 0);
    shippingMethods = await listAvailableShippingMethods(
      new DrizzleShippingMethodStore(db),
      itemsSubtotal
    );
  }
  return (
    <div className="mx-auto w-full max-w-3xl">
      <StorefrontPageHeader>Secure Checkout</StorefrontPageHeader>
      <CheckoutTable
        submissionToken={randomUUID()}
        customer={
          customer
            ? { email: customer.email, displayName: customer.displayName }
            : null
        }
        itemsSubtotal={itemsSubtotal}
        shippingMethods={shippingMethods}
      />
    </div>
  );
}
