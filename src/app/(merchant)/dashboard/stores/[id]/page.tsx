import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { getMerchantStoreRepository } from "@/lib/merchant-stores/server";
import { getMerchantSubscriptionRepository } from "@/lib/merchant-subscriptions/server";
import { getStoreReadinessRepository } from "@/lib/store-readiness/server";
import {
  activateStoreAction,
  selectStorePlanAction,
} from "./_actions";

export default async function MerchantStoreDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ plan?: string; activation?: string }>;
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
  const readinessRepository = getStoreReadinessRepository();
  const [
    t,
    tSubscription,
    tReadiness,
    tActivation,
    activePlans,
    subscription,
    readiness,
    query,
  ] = await Promise.all([
    getTranslations("MerchantStore"),
    getTranslations("MerchantSubscription"),
    getTranslations("MerchantReadiness"),
    getTranslations("MerchantActivation"),
    subscriptionRepository.listActivePlans(),
    subscriptionRepository.findForOwnedStore(merchant.id, id),
    readinessRepository.evaluateForOwnedStore(merchant.id, id),
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
            href="/dashboard/business/edit"
            className="min-h-11 rounded-lg bg-foreground px-5 py-2.5 font-semibold text-background"
          >
            {t("editStore")}
          </Link>
          {store.tenantId !== null ? (
            <Link
              href={"/dashboard/stores/" + store.id + "/domain"}
              className="min-h-11 rounded-lg border border-border px-5 py-2.5 font-semibold"
            >
              {t("manageDomain")}
            </Link>
          ) : null}
          <Link
            href="/dashboard/stores"
            className="min-h-11 rounded-lg border border-border px-5 py-2.5 font-semibold"
          >
            {t("backToStores")}
          </Link>
        </div>
      </section>

      {store.tenantId === null && readiness ? (
        <section
          id="readiness"
          className="mt-6 rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold">{tReadiness("title")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {tReadiness("description")}
              </p>
            </div>
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
              {readiness.ready
                ? tReadiness("ready")
                : tReadiness("notReady")}
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {readiness.requirements.map((requirement) => (
              <div
                key={requirement.key}
                className="rounded-xl border border-border px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">
                    {tReadiness(requirement.key)}
                  </p>
                  <span className="text-sm font-medium">
                    {tReadiness(requirement.status)}
                  </span>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {tReadiness(requirement.reason)}
                </p>

                {requirement.key === "store_profile" &&
                requirement.status !== "complete" ? (
                  <Link
                    href={"/dashboard/stores/" + store.id + "/edit"}
                    className="mt-2 inline-block text-sm font-semibold underline underline-offset-4"
                  >
                    {tReadiness("editBusinessProfile")}
                  </Link>
                ) : null}

                {requirement.key === "policies" ? (
                  <Link
                    href={"/dashboard/stores/" + store.id + "/policies"}
                    className="mt-2 inline-block text-sm font-semibold underline underline-offset-4"
                  >
                    {tReadiness(
                      requirement.status === "complete"
                        ? "managePolicies"
                        : "configurePolicies"
                    )}
                  </Link>
                ) : null}

                {requirement.key === "subscription" &&
                requirement.status !== "complete" ? (
                  <a
                    href="#plan"
                    className="mt-2 inline-block text-sm font-semibold underline underline-offset-4"
                  >
                    {tReadiness("configureSubscription")}
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mt-6 rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <h2 className="text-xl font-bold">{tActivation("title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {tActivation("description")}
        </p>

        {query.activation === "success" ? (
          <p
            role="status"
            className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm"
          >
            {tActivation("provisioned")}
          </p>
        ) : null}

        {query.activation === "not-ready" ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm"
          >
            {tActivation("notReady")}
          </p>
        ) : null}

        {query.activation === "plan" ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm"
          >
            {tActivation("planNotProvisionable")}
          </p>
        ) : null}

        {query.activation === "failed" ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm"
          >
            {tActivation("failed")}
          </p>
        ) : null}

        {store.tenantId !== null ? (
          <Link
            href={"/" + store.slug}
            className="mt-5 inline-flex min-h-11 items-center rounded-lg bg-foreground px-5 py-2.5 font-semibold text-background"
          >
            {tActivation("openStore")}
          </Link>
        ) : store.status === "activation_requested" ||
          store.status === "provisioning" ? (
          <p className="mt-5 rounded-xl bg-muted px-4 py-3 text-sm">
            {tActivation("inProgress")}
          </p>
        ) : readiness?.ready ? (
          <form action={activateStoreAction} className="mt-5">
            <input type="hidden" name="storeId" value={store.id} />
            <button
              type="submit"
              className="min-h-11 rounded-lg bg-foreground px-5 py-2.5 font-semibold text-background"
            >
              {tActivation("activate")}
            </button>
          </form>
        ) : (
          <p className="mt-5 rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
            {tActivation("blocked")}
          </p>
        )}
      </section>

      <section
        id="plan"
        className="mt-6 rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8"
      >
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

        {subscription?.plan.status === "inactive" ? (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm"
          >
            {tSubscription(
              store.tenantId === null
                ? "inactivePlanBlocksActivation"
                : "inactivePlanGrandfathered"
            )}
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
                {subscription?.plan.status === "inactive" ? (
                  <option value={subscription.plan.code} disabled>
                    {planDisplayName(
                      subscription.plan.code,
                      subscription.plan.name
                    )}{" "}
                    — {tSubscription("unavailable")}
                  </option>
                ) : null}
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
