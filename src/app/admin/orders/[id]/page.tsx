import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { orderProducts, orders, products } from "@/drizzle/schema";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { AdminFormHeader } from "../../_components/AdminFormHeader";
import { updateOrderFulfillment } from "../../_actions/shipping";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/formatters";

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const orderId = Number((await params).id);
  if (!Number.isSafeInteger(orderId)) notFound();
  const { db } = await requireTenantAdminDb();
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) notFound();
  const items = await db.select({ productId: orderProducts.productId, name: products.name, quantity: orderProducts.quantity, price: orderProducts.priceAtPurchase }).from(orderProducts).leftJoin(products, eq(products.id, orderProducts.productId)).where(eq(orderProducts.orderId, orderId));
  const itemsSubtotal = order.itemsSubtotal ?? items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const shippingTotal = order.shippingTotal ?? 0;
  const pickup = order.shippingMethodType === "store_pickup";
  return <div className="space-y-6"><AdminFormHeader title={`Order ${order.orderNumber}`} backHref="/admin/orders" backLabel="Back to Orders" />
    <section className="grid gap-4 rounded-xl border p-4 sm:grid-cols-2"><div><p className="text-sm text-muted-foreground">Shipping method</p><p>{order.shippingMethodName ?? order.shippingMethod}</p></div><div><p className="text-sm text-muted-foreground">Fulfillment</p><p className="capitalize">{order.fulfillmentStatus.replaceAll("_", " ")}</p></div><div><p className="text-sm text-muted-foreground">Tracking number</p><p>{order.trackingNumber ?? "—"}</p></div><div><p className="text-sm text-muted-foreground">Shipping address</p><p className="break-words">{order.shippingAddress ?? "Not required"}</p></div></section>
    <section className="rounded-xl border p-4"><h2 className="mb-3 font-semibold">Items</h2>{items.map((item) => <div key={item.productId} className="flex justify-between border-t py-2 first:border-0"><span>{item.name ?? `Product #${item.productId}`} × {item.quantity}</span><span>{formatCurrency(item.price * item.quantity)}</span></div>)}<div className="mt-3 space-y-1 border-t pt-3"><div className="flex justify-between"><span>Items subtotal</span><span>{formatCurrency(itemsSubtotal)}</span></div><div className="flex justify-between"><span>Shipping</span><span>{formatCurrency(shippingTotal)}</span></div><div className="flex justify-between font-semibold"><span>Total</span><span>{formatCurrency(order.totalPrice)}</span></div></div></section>
    <form action={updateOrderFulfillment.bind(null, orderId)} className="space-y-4 rounded-xl border p-4"><h2 className="font-semibold">Update fulfillment</h2><select name="status" defaultValue={order.fulfillmentStatus} className="min-h-11 w-full rounded-md border bg-background px-3"><option value="unfulfilled">Unfulfilled</option><option value="processing">Processing</option>{pickup ? <><option value="ready_for_pickup">Ready for pickup</option><option value="picked_up">Picked up</option></> : <><option value="shipped">Shipped</option><option value="delivered">Delivered</option></>}<option value="cancelled">Cancelled</option></select>{!pickup && <label className="block space-y-1"><span>Tracking number</span><input name="trackingNumber" maxLength={160} defaultValue={order.trackingNumber ?? ""} className="min-h-11 w-full rounded-md border bg-background px-3" /></label>}<Button type="submit">Update fulfillment</Button></form>
  </div>;
}
