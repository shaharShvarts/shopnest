import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { getMerchantStoreRepository } from "@/lib/merchant-stores/server";
import { getMerchantSubscriptionRepository } from "@/lib/merchant-subscriptions/server";
import { selectStorePlanAction } from "./_actions";

export default async function MerchantStoreDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ plan?: string }>;
}) {
  const merchant = await requireMerchantPage();

  let id: number;
  try {
    id = parseStoreId((await params).id);
  } catch {
    notFound();
  }

  const store =
    await getMerchantStoreRepository().findOwnedById(
      merchant.id,
      id
    );

  if (!store) {
    notFound();
  }

  const subscriptionRepository = getMerchantSubscriptionRepository();
  const [t, tSubscription, activePlans, subscription, query] =
    await Promise.all([
      getTranslations("MerchantStore"),
      getTranslations("MerchantSubscription"),
      subscriptionRepository.listActivePlans(),
      subscriptionRepository.findForOwnedStore(merchant.id, id),
      searchParams,
    ]);

  const planDisplayName = (code: string, fallback: string) => {
    switch (code) {
      case "free":
        return tSubscription("planFree");
      case "small":
        return tSubscription("planSmall");
      case "medium":
        return tSubscription("planMedium");
      case "large":
        return tSubscription("planLarge");
      default:
        return fallback;
    }
  };

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">
          {store.displayName}
        </h1>
        <p className="mt-2 font-mono text-sm text-muted-foreground">
          shopnest.co.il/{store.slug}
        </p>
      </header>

      <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <dl className="grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              {t("slug")}
            </dt>
            <dd className="mt-1 font-mono">{store.slug}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              {t("status")}
            </dt>
            <dd className="mt-1 font-medium">
              {t(store.status)}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              {t("tenant")}
            </dt>
            <dd className="mt-1 font-medium">
              {store.tenantId === null
                ? t("notProvisioned")
                : "#" + store.tenantId}
            </dd>
          </div>
        </dl>

        {store.tenantId === null ? (
          <p className="mt-6 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            {t("notLiveYet")}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={"/dashboard/stores/" + store.id + "/edit"}
            className="min-h-11 rounded-lg bg-foreground px-5 py-2.5 font-semibold text-background"
          >
            {t("editStore")}
          </Link>
          <Link
            href="/dashboard/stores"
            className="min-h-11 rounded-lg border border-border px-5 py-2.5 font-semibold"
          >
            {t("backToStores")}
          </Link>
        </div>
      </section>

      <section className="mt-6 rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{tSubscription("plan")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {tSubscription("selectionHelp")}
            </p>
          </div>
          <div className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
            {subscription
              ? tSubscription(subscription.status)
              : tSubscription("notSelected")}
          </div>
        </div>

        {query.plan === "saved" ? (
          <p
            role="status"
            className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm"
          >
            {tSubscription("selectionSaved")}
          </p>
        ) : null}

        {query.plan === "unavailable" ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm"
          >
            {tSubscription("selectionUnavailable")}
          </p>
        ) : null}

        {query.plan === "locked" ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm"
          >
            {tSubscription("selectionLocked")}
          </p>
        ) : null}

        <dl className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              {tSubscription("selectedPlan")}
            </dt>
            <dd className="mt-1 font-medium">
              {subscription
                ? planDisplayName(subscription.plan.code, subscription.plan.name)
                : tSubscription("notSelected")}
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-muted-foreground">
              {tSubscription("subscriptionStatus")}
            </dt>
            <dd className="mt-1 font-medium">
              {subscription
                ? tSubscription(subscription.status)
                : tSubscription("notSelected")}
            </dd>
          </div>
        </dl>

        {store.tenantId === null ? (
          <form action={selectStorePlanAction} className="mt-6 space-y-3">
            <input type="hidden" name="storeId" value={store.id} />
            <label
              htmlFor="planCode"
              className="block text-sm font-semibold"
            >
              {tSubscription("selectPlan")}
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <select
                id="planCode"
                name="planCode"
                required
                defaultValue={subscription?.plan.code ?? ""}
                className="min-h-11 flex-1 rounded-lg border border-border bg-background px-3 py-2"
                disabled={activePlans.length === 0}
              >
                <option value="" disabled>
                  {tSubscription("choosePlan")}
                </option>
                {activePlans.map((plan) => (
                  <option key={plan.id} value={plan.code}>
                    {planDisplayName(plan.code, plan.name)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={activePlans.length === 0}
                className="min-h-11 rounded-lg bg-foreground px-5 py-2.5 font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50"
              >
                {tSubscription("savePlan")}
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            {tSubscription("selectionLocked")}
          </p>
        )}
      </section>
    </main>
  );
}
