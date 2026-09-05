import { getTranslations } from "next-intl/server";
import { requireTenantAdminDb } from "@/lib/admin-auth/server";
import { DrizzlePaymentStore } from "@/lib/payments/drizzle-store";
import { providerMetadata } from "@/lib/payments/registry";
import { PageHeader } from "../../components/PageHeader";
import { PaymentSettingsForm } from "./settings-form";

export default async function PaymentsPage() {
  const { tenant } = await requireTenantAdminDb();
  const store = new DrizzlePaymentStore(tenant);
  const [settings, payments, t] = await Promise.all([
    store.readSettings(),
    store.recentPayments(),
    getTranslations("Payments"),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader>{t("title")}</PageHeader>
      <p className="max-w-2xl text-muted-foreground">{t("description")}</p>
      <PaymentSettingsForm settings={settings} providers={providerMetadata()} />
      <section className="space-y-3 rounded-xl border p-4 sm:p-6">
        <h2 className="text-lg font-semibold">{t("recentPayments")}</h2>
        {!payments.length ? (
          <p>{t("noPayments")}</p>
        ) : (
          <ul className="divide-y">
            {payments.map((payment) => (
              <li
                key={payment.id}
                className="flex flex-wrap justify-between gap-3 py-3"
              >
                <span>
                  {t("order")} #{payment.orderId} · {payment.provider}
                </span>
                <span>
                  {payment.amount} {payment.currency} ·{" "}
                  {t(`statuses.${payment.status}`)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
