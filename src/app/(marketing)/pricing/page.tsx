import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  formatPublicIlsPrice,
  listPublicPlans,
} from "@/lib/public-plans/server";
import { MarketingFooter } from "../_components/MarketingFooter";
import { MarketingHeader } from "../_components/MarketingHeader";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [t, plans] = await Promise.all([
    getTranslations("Marketing"),
    listPublicPlans(),
  ]);

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold tracking-tight">{t("pricing.title")}</h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">{t("pricing.subtitle")}</p>
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {plans.map((plan) => {
            const monthly = formatPublicIlsPrice(plan.monthlyAmountMinor);
            const annual = formatPublicIlsPrice(plan.annualAmountMinor);

            return (
              <article key={plan.id} className="rounded-2xl border p-6">
                <h2 className="text-xl font-semibold">{plan.name}</h2>
                <dl className="mt-4 space-y-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Monthly</dt>
                    <dd className="font-medium">{monthly ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Annual</dt>
                    <dd className="font-medium">{annual ?? "—"}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">{t("pricing.pricingNote")}</p>
        <Link href="/" className="mt-8 inline-flex min-h-11 items-center font-semibold">{t("placeholders.backHome")}</Link>
      </main>
      <MarketingFooter />
    </>
  );
}
