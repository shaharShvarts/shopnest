import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { inspectStoreManagerInvitation } from "@/lib/store-team/server";
import { MarketingFooter } from "../_components/MarketingFooter";
import { MarketingHeader } from "../_components/MarketingHeader";
import { ManagerInviteCompletionForm } from "../_components/ManagerInviteCompletionForm";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const t = await getTranslations("StoreManagerInvite");
  const token = (await searchParams).token ?? "";
  const state = await inspectStoreManagerInvitation(token);

  return (
    <>
      <MarketingHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
          {state.kind === "pending" ? (
            <>
              <h1 className="text-3xl font-bold tracking-tight">
                {t("title")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("detail", {
                  store: state.storeName,
                  email: state.email,
                })}
              </p>
              <div className="mt-6">
                <ManagerInviteCompletionForm token={token} />
              </div>
            </>
          ) : (
            <>
              <h1 className="text-3xl font-bold tracking-tight">
                {state.kind === "expired"
                  ? t("expiredTitle")
                  : state.kind === "completed"
                    ? t("completedTitle")
                    : t("invalidTitle")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {state.kind === "expired"
                  ? t("expiredDetail")
                  : state.kind === "completed"
                    ? t("completedDetail")
                    : t("invalidDetail")}
              </p>
              <Link
                href="/login"
                className="mt-6 inline-flex min-h-11 items-center rounded-lg bg-foreground px-4 py-2 font-semibold text-background"
              >
                {t("goToLogin")}
              </Link>
            </>
          )}
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
