import { asc } from "drizzle-orm";
import { shippingMethods } from "@/drizzle/schema";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { TenantLink } from "@/components/TenantLink";
import { Button } from "@/components/ui/button";
import { PageHeader } from "../../components/PageHeader";
import { toggleShippingMethod } from "../_actions/shipping";

export default async function AdminShippingPage() {
  const { db } = await requireTenantAdminDb();
  const methods = await db.select().from(shippingMethods).orderBy(asc(shippingMethods.sortOrder), asc(shippingMethods.name));
  return <div className="space-y-6">
    <div className="flex items-center justify-between gap-4"><PageHeader>Shipping</PageHeader><Button asChild><TenantLink href="/admin/shipping/new">Add method</TenantLink></Button></div>
    {!methods.length ? <p className="rounded-xl border p-6 text-muted-foreground">No shipping methods configured. Checkout remains safely unavailable until one is activated.</p> : <div className="grid gap-3">{methods.map((method) => <article key={method.id} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div><h2 className="font-semibold">{method.name}</h2><p className="text-sm text-muted-foreground">{method.type.replaceAll("_", " ")} · ₪{method.price} · {method.freeShippingThreshold == null ? "No free threshold" : `Free from ₪${method.freeShippingThreshold}`}</p></div>
      <div className="flex gap-2"><Button asChild variant="outline"><TenantLink href={`/admin/shipping/${method.id}/edit`}>Edit</TenantLink></Button><form action={toggleShippingMethod.bind(null, method.id, !method.isActive)}><Button type="submit" variant={method.isActive ? "secondary" : "default"}>{method.isActive ? "Disable" : "Enable"}</Button></form></div>
    </article>)}</div>}
  </div>;
}
