import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDbForTenant } from "@/drizzle/db";
import { orders } from "@/drizzle/schema";
import { getCurrentCustomer } from "@/lib/customer-auth/server";
import { formatCurrency } from "@/lib/formatters";
import { getTenant } from "@/lib/tenant-context";
import { TenantLink } from "@/components/TenantLink";

export default async function CustomerOrdersPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/");
  const customer = await getCurrentCustomer();
  if (!customer) {
    redirect(
      `${tenant.basePath}/account/login?callback=${encodeURIComponent(`${tenant.basePath}/account/orders`)}`
    );
  }
  const rows = await getDbForTenant(tenant)
    .select({
      id: orders.id,
      orderNumber: orders.orderNumber,
      status: orders.status,
      totalPrice: orders.totalPrice,
      itemsSubtotal: orders.itemsSubtotal,
      shippingTotal: orders.shippingTotal,
      shippingMethod: orders.shippingMethod,
      shippingMethodName: orders.shippingMethodName,
      fulfillmentStatus: orders.fulfillmentStatus,
      trackingNumber: orders.trackingNumber,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(eq(orders.customerAccountId, customer.id))
    .orderBy(desc(orders.createdAt));
  const t = await getTranslations("CustomerAccount");
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 py-4 sm:py-8">
      <h1 className="text-3xl font-bold tracking-tight">{t("orders")}</h1>
      {rows.length === 0 ? (
        <div className="rounded-2xl bg-muted/60 p-8 text-center"><h2 className="text-lg font-semibold">{t("noOrders")}</h2><p className="mt-2 text-sm text-muted-foreground">{t("noOrdersDetail")}</p></div>
      ) : (
        <div className="space-y-3">
          {rows.map((order) => (
            <TenantLink href={`/account/orders/${order.id}`} key={order.id} className="grid gap-3 rounded-2xl bg-background p-4 shadow-sm ring-1 ring-black/5 transition hover:bg-muted/30 sm:grid-cols-3 sm:p-5">
              <div><p className="text-xs text-muted-foreground">{t("orderNumber")}</p><p className="break-all font-mono font-semibold">{order.orderNumber}</p></div>
              <div><p className="text-xs text-muted-foreground">{t("status")}</p><p className="capitalize">{order.status} · {order.fulfillmentStatus.replaceAll("_", " ")}</p></div>
              <div className="sm:text-end"><p className="text-xs text-muted-foreground">{t("total")}</p><p className="font-semibold">{formatCurrency(order.totalPrice)}</p></div>
              <div><p className="text-xs text-muted-foreground">Shipping method</p><p>{order.shippingMethodName ?? order.shippingMethod ?? "—"}</p></div>
              <div><p className="text-xs text-muted-foreground">Shipping</p><p>{order.shippingTotal == null ? "—" : formatCurrency(order.shippingTotal)}</p></div>
              {order.trackingNumber && <div className="sm:text-end"><p className="text-xs text-muted-foreground">Tracking number</p><p className="break-all font-mono">{order.trackingNumber}</p></div>}
            </TenantLink>
          ))}
        </div>
      )}
    </div>
  );
}
