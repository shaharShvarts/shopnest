import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { ManagementInput } from "@/components/management/ManagementInput";
import { parseStoreId } from "@/lib/merchant-stores/core";
import {
  getOwnedStoreManagerQuota,
  listOwnedStoreManagers,
  listStoreManagerPlanOptions,
} from "@/lib/store-team/server";
import {
  assignExistingStoreManagerAction,
  createStoreManagerAction,
  removeStoreManagerAction,
} from "../_actions/team";

export default async function StoreTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string }>;
}) {
  let storeId: number;
  try {
    storeId = parseStoreId((await params).id);
  } catch {
    notFound();
  }

  const [t, managers, quota, planOptions, query] = await Promise.all([
    getTranslations("StoreTeam"),
    listOwnedStoreManagers(storeId),
    getOwnedStoreManagerQuota(storeId),
    listStoreManagerPlanOptions(),
    searchParams,
  ]);

  const canAdd = quota.unlimited || quota.used < quota.limit;
  const createAction = createStoreManagerAction.bind(null, storeId);
  const assignAction = assignExistingStoreManagerAction.bind(null, storeId);
  const removeAction = removeStoreManagerAction.bind(null, storeId);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          ShopNest
        </p>
        <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("description")}</p>
      </header>

      {query.result ? (
        <p
          role="status"
          className="mb-6 rounded-xl bg-muted px-4 py-3 text-sm"
        >
          {t(`result.${query.result}`)}
        </p>
      ) : null}

      <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{t("usageTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {quota.unlimited
                ? t("usageUnlimited", { used: quota.used })
                : t("usageFinite", {
                    used: quota.used,
                    limit: quota.limit,
                    remaining: quota.remaining ?? 0,
                  })}
            </p>
          </div>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
            {quota.unlimited ? t("unlimited") : `${quota.used} / ${quota.limit}`}
          </span>
        </div>

        {!canAdd ? (
          <div className="mt-5 rounded-xl border border-border bg-muted/50 px-4 py-4">
            <p className="font-semibold">{t("limitReachedTitle")}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("limitReachedDescription")}
            </p>
            {planOptions.length > 0 ? (
              <div className="mt-3 space-y-1 text-sm">
                {planOptions.map((plan) => (
                  <p key={plan.planCode}>
                    <span className="font-semibold">{plan.planName}:</span>{" "}
                    {plan.limit === -1
                      ? t("unlimitedManagers")
                      : t("managerCount", { count: plan.limit })}
                  </p>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                {t("planLimitsPending")}
              </p>
            )}
          </div>
        ) : null}
      </section>

      <section className="mt-6 rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <h2 className="text-xl font-bold">{t("assignedTitle")}</h2>
        {managers.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            {t("noManagers")}
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {managers.map((manager) => (
              <div
                key={manager.adminUserId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-4 py-3"
              >
                <div>
                  <p className="font-medium">{manager.email}</p>
                  <p className="text-sm text-muted-foreground">
                    {manager.isActive ? t("active") : t("inactive")}
                  </p>
                </div>
                <form action={removeAction}>
                  <input
                    type="hidden"
                    name="adminUserId"
                    value={manager.adminUserId}
                  />
                  <Button
                    type="submit"
                    variant="outline"
                    size="management"
                    className="border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800"
                  >
                    {t("remove")}
                  </Button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-6 rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <h2 className="text-xl font-bold">{t("createTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("createHelp")}</p>
        <form action={createAction} className="mt-5 space-y-4">
          <div>
            <label htmlFor="manager-email" className="mb-1 block text-sm font-medium">
              {t("email")}
            </label>
            <ManagementInput
              id="manager-email"
              name="email"
              type="email"
              required
              disabled={!canAdd}
            />
          </div>
          <div>
            <label htmlFor="manager-password" className="mb-1 block text-sm font-medium">
              {t("temporaryPassword")}
            </label>
            <ManagementInput
              id="manager-password"
              name="password"
              type="password"
              minLength={12}
              required
              disabled={!canAdd}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              {t("passwordHelp")}
            </p>
          </div>
          <Button
            type="submit"
            size="management"
            disabled={!canAdd}
            className="px-5"
          >
            {t("create")}
          </Button>
        </form>
      </section>

      <section className="mt-6 rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <h2 className="text-xl font-bold">{t("assignTitle")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("assignHelp")}</p>
        <form action={assignAction} className="mt-5 flex flex-col gap-3 sm:flex-row">
          <ManagementInput
            name="email"
            type="email"
            required
            disabled={!canAdd}
            placeholder={t("email")}
            className="flex-1"
          />
          <Button
            type="submit"
            variant="outline"
            size="management"
            disabled={!canAdd}
            className="px-5"
          >
            {t("assign")}
          </Button>
        </form>
      </section>

      <Button asChild variant="outline" size="management" className="mt-6">
        <Link href={`/dashboard/stores/${storeId}`}>{t("back")}</Link>
      </Button>
    </main>
  );
}
