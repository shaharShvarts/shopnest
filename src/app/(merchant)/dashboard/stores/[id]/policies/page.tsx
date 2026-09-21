import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import type {
  MerchantPolicyDocument,
  StorePolicyType,
} from "@/lib/merchant-policies/core";
import { getMerchantPolicyRepository } from "@/lib/merchant-policies/server";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { getMerchantStoreRepository } from "@/lib/merchant-stores/server";
import { PolicyDocumentEditor } from "./PolicyDocumentForm";

export default async function MerchantStorePoliciesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const merchant = await requireMerchantPage();

  let storeId: number;
  try {
    storeId = parseStoreId((await params).id);
  } catch {
    notFound();
  }

  const [store, workspace, t] = await Promise.all([
    getMerchantStoreRepository().findOwnedById(merchant.id, storeId),
    getMerchantPolicyRepository().getWorkspaceForOwnedStore(
      merchant.id,
      storeId
    ),
    getTranslations("MerchantPolicies"),
  ]);

  if (!store || !workspace) {
    notFound();
  }

  const latestByType = new Map<StorePolicyType, MerchantPolicyDocument>(
    workspace.documents.map((document) => [document.policyType, document])
  );

  const policyLabel = (policyType: StorePolicyType) => {
    switch (policyType) {
      case "returns_refunds_cancellation":
        return t("returnsRefundsCancellation");
      case "privacy":
        return t("privacy");
      case "terms":
        return t("terms");
      case "shipping_delivery":
        return t("shippingDelivery");
      case "cookie_tracking":
        return t("cookieTracking");
    }
  };

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6 sm:py-14">
      <header className="mb-8">
        <p className="text-sm font-semibold text-muted-foreground">
          {store.displayName}
        </p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("description", { market: workspace.market })}
        </p>
      </header>

      {workspace.requiredPolicyTypes === null ? (
        <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
          <h2 className="text-xl font-bold">{t("marketUnavailableTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("marketUnavailable")}
          </p>
        </section>
      ) : (
        <div className="space-y-6">
          {workspace.requiredPolicyTypes.map((policyType) => {
            const document = latestByType.get(policyType);

            return (
              <PolicyDocumentEditor
                key={policyType}
                storeId={storeId}
                policyType={policyType}
                policyLabel={policyLabel(policyType)}
                initialVersion={document?.version ?? null}
                initialStatus={document?.status ?? null}
                defaultTitle={
                  document?.title ?? policyLabel(policyType)
                }
                defaultContent={document?.content ?? ""}
                labels={{
                  documentTitle: t("documentTitle"),
                  content: t("content"),
                  contentHelp: t("contentHelp"),
                  saveDraft: t("saveDraft"),
                  publish: t("publish"),
                  draft: t("draft"),
                  published: t("published"),
                  missing: t("missing"),
                  notCreated: t("notCreated"),
                  version: t("version", { version: "{version}" }),
                  saved: t("saved"),
                  invalid: t("invalid"),
                  unavailable: t("unavailable"),
                  unsavedChanges: t("unsavedChanges"),
                  characters: t("characters"),
                }}
              />
            );
          })}
        </div>
      )}

      <div className="mt-8">
        <Link
          href={"/dashboard/stores/" + storeId}
          className="font-semibold underline underline-offset-4"
        >
          {t("backToStore")}
        </Link>
      </div>
    </main>
  );
}
