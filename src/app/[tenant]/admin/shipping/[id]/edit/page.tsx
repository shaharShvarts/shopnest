import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { shippingMethods } from "@/drizzle/schema";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { AdminFormHeader } from "../../../_components/AdminFormHeader";
import { updateShippingMethod } from "../../../_actions/shipping";
import { ShippingMethodForm } from "../../_components/ShippingMethodForm";

export default async function EditShippingMethodPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const methodId = Number(id);
  if (!Number.isSafeInteger(methodId)) notFound();
  const { db } = await requireTenantAdminDb();
  const [method] = await db.select().from(shippingMethods).where(eq(shippingMethods.id, methodId)).limit(1);
  if (!method) notFound();
  return <div className="space-y-6"><AdminFormHeader title="Edit shipping method" backHref="/admin/shipping" backLabel="Back to Shipping" /><ShippingMethodForm method={method} action={updateShippingMethod.bind(null, methodId)} /></div>;
}
