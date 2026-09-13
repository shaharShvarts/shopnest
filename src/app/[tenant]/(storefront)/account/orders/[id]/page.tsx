import { and, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";
import { getDbForTenant } from "@/drizzle/db";
import { orderProducts, orders, products } from "@/drizzle/schema";
import { TenantLink } from "@/components/TenantLink";
import { getCurrentCustomer } from "@/lib/customer-auth/server";
import { formatCurrency } from "@/lib/formatters";
import { getTenant } from "@/lib/tenant-context";

export default async function CustomerOrderDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const tenant = await getTenant();
  if (!tenant) redirect("/");
  const customer = await getCurrentCustomer();
  if (!customer) redirect(`${tenant.basePath}/account/login`);
  const orderId = Number((await params).id);
  if (!Number.isSafeInteger(orderId)) notFound();
  const db = getDbForTenant(tenant);
  const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.customerAccountId, customer.id))).limit(1);
  if (!order) notFound();
  const items = await db.select({ id: orderProducts.id, productId: orderProducts.productId, name: products.name, quantity: orderProducts.quantity, price: orderProducts.priceAtPurchase }).from(orderProducts).leftJoin(products, eq(products.id, orderProducts.productId)).where(eq(orderProducts.orderId, order.id));
  const itemsSubtotal = order.itemsSubtotal ?? items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  return <div className="mx-auto w-full max-w-3xl space-y-6 py-4 sm:py-8">
    <TenantLink href="/account/orders" className="inline-flex min-h-11 items-center rounded-md border px-4">← Back to orders</TenantLink>
    <h1 className="break-all text-2xl font-bold sm:text-3xl">Order {order.orderNumber}</h1>
    <section className="grid gap-4 rounded-2xl border p-4 sm:grid-cols-2 sm:p-6"><div><p className="text-sm text-muted-foreground">Shipping method</p><p>{order.shippingMethodName ?? order.shippingMethod ?? "—"}</p></div><div><p className="text-sm text-muted-foreground">Fulfillment status</p><p className="capitalize">{order.fulfillmentStatus.replaceAll("_", " ")}</p></div>{order.trackingNumber && <div><p className="text-sm text-muted-foreground">Tracking number</p><p className="break-all font-mono">{order.trackingNumber}</p></div>}</section>
    <section className="rounded-2xl border p-4 sm:p-6"><h2 className="mb-3 text-lg font-semibold">Items</h2>{items.map((item) => <div key={item.id} className="flex justify-between gap-3 border-t py-3 first:border-0"><span>{item.name ?? `Product #${item.productId}`} × {item.quantity}</span><span>{formatCurrency(item.price * item.quantity)}</span></div>)}<div className="space-y-2 border-t pt-3"><div className="flex justify-between"><span>Items subtotal</span><span>{formatCurrency(itemsSubtotal)}</span></div><div className="flex justify-between"><span>Shipping</span><span>{order.shippingTotal == null ? "—" : formatCurrency(order.shippingTotal)}</span></div><div className="flex justify-between font-semibold"><span>Total</span><span>{formatCurrency(order.totalPrice)}</span></div></div></section>
  </div>;
}
