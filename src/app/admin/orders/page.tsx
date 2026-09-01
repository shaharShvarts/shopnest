import { desc } from "drizzle-orm";
import { orders } from "@/drizzle/schema";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { TenantLink } from "@/components/TenantLink";
import { PageHeader } from "../../components/PageHeader";
import { formatCurrency } from "@/lib/formatters";

export default async function AdminOrdersPage() {
  const { db } = await requireTenantAdminDb();
  const rows = await db.select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status, fulfillmentStatus: orders.fulfillmentStatus, totalPrice: orders.totalPrice, createdAt: orders.createdAt }).from(orders).orderBy(desc(orders.createdAt));
  return <div className="space-y-6"><PageHeader>Orders</PageHeader>{!rows.length ? <p className="rounded-xl border p-6 text-muted-foreground">No orders yet.</p> : <div className="grid gap-3">{rows.map((order) => <TenantLink key={order.id} href={`/admin/orders/${order.id}`} className="grid gap-2 rounded-xl border p-4 transition hover:bg-muted/50 sm:grid-cols-4 sm:items-center"><span className="font-mono font-semibold">{order.orderNumber}</span><span className="capitalize">{order.status}</span><span className="capitalize">{order.fulfillmentStatus.replaceAll("_", " ")}</span><span className="sm:text-end">{formatCurrency(order.totalPrice)}</span></TenantLink>)}</div>}</div>;
}
