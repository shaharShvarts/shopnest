import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { getTenant } from "@/lib/tenant-context";
import { commerceOwnerKey, getCommerceIdentity } from "@/lib/customer-commerce/identity";
import { DrizzlePaymentStore } from "@/lib/payments/drizzle-store";

// Read only. Even ?success=true or a forged provider redirect cannot mark paid.
export default async function PaymentReturnPage({ params }: { params: Promise<{ id: string }> }) {
  const tenant = await getTenant();
  const { id } = await params;
  if (!tenant || !z.string().uuid().safeParse(id).success) notFound();
  const ownerKey = commerceOwnerKey(await getCommerceIdentity());
  const store = new DrizzlePaymentStore(tenant);
  const attempt = await store.getAttempt(id);
  if (!attempt || !ownerKey) notFound();
  const allowed = await store.transaction(async (tx) => (await tx.lockOrder(attempt.orderId))?.ownerKey === ownerKey);
  if (!allowed) notFound();
  const t = await getTranslations("Payments");
  return <section className="mx-auto max-w-2xl space-y-4 rounded-xl border p-6">
    <h1 className="text-2xl font-semibold">{t("paymentStatus")}</h1>
    <p>{t(`statuses.${attempt.status}`)}</p>
    <p className="text-muted-foreground">{t("returnExplanation")}</p>
  </section>;
}
