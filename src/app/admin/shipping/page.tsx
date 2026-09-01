import { asc } from "drizzle-orm";
import { shippingMethods } from "@/drizzle/schema";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { TenantLink } from "@/components/TenantLink";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../../components/PageHeader";
import { ShippingMethodOrderList } from "./_components/ShippingMethodOrderList";

export default async function AdminShippingPage() {
  const { db } = await requireTenantAdminDb();
  const methods = await db.select({
    id: shippingMethods.id,
    name: shippingMethods.name,
    code: shippingMethods.code,
    type: shippingMethods.type,
    isActive: shippingMethods.isActive,
    price: shippingMethods.price,
    freeShippingThreshold: shippingMethods.freeShippingThreshold,
    sortOrder: shippingMethods.sortOrder,
  }).from(shippingMethods).orderBy(asc(shippingMethods.sortOrder), asc(shippingMethods.name));
  return <div className="space-y-6">
    <div className="flex items-center justify-between gap-4"><PageHeader>Shipping</PageHeader><Button asChild><TenantLink href="/admin/shipping/new">Add method</TenantLink></Button></div>
    {!methods.length ? <p className="rounded-xl border p-6 text-muted-foreground">No shipping methods configured. Checkout remains safely unavailable until one is activated.</p> : <ShippingMethodOrderList methods={methods} />}
  </div>;
}
