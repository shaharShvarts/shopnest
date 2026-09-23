"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type {
  MerchantDomainActionState,
  MerchantDomainView,
} from "@/lib/merchant-domains/core";
import {
  checkDomainCnameAction,
  checkDomainProviderAction,
  checkDomainTxtAction,
  removeDomainAction,
  startDomainClaimAction,
} from "./_actions";

function remainingSeconds(value: string | null, now: number) {
  if (!value) return 0;
  return Math.max(0, Math.ceil((new Date(value).getTime() - now) / 1000));
}

function CopyValue({ value }: { value: string }) {
  const t = useTranslations("MerchantDomain");
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <code className="min-w-0 flex-1 break-all rounded-lg bg-muted px-3 py-2 text-sm">
        {value}
      </code>
      <button
        type="button"
        onClick={() => void navigator.clipboard.writeText(value)}
        className="min-h-10 rounded-lg border border-border px-3 text-sm font-semibold"
      >
        {t("copy")}
      </button>
    </div>
  );
}

export function DomainManager({ view }: { view: MerchantDomainView }) {
  const t = useTranslations("MerchantDomain");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<MerchantDomainActionState>({
    kind: "idle",
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const token =
    result.kind === "claim_started" ? result.token ?? null : null;

  const txtNext =
    result.kind === "cooldown" && result.nextAllowedAt
      ? result.nextAllowedAt
      : view.claim?.nextTxtCheckAt ?? null;
  const cnameNext =
    result.kind === "cooldown" && result.nextAllowedAt
      ? result.nextAllowedAt
      : view.claim?.nextCnameCheckAt ?? null;
  const providerNext =
    result.kind === "cooldown" && result.nextAllowedAt
      ? result.nextAllowedAt
      : view.candidate?.nextProviderCheckAt ?? null;

  const txtRemaining = remainingSeconds(txtNext, now);
  const cnameRemaining = remainingSeconds(cnameNext, now);
  const providerRemaining = remainingSeconds(providerNext, now);

  const activeAddress = view.currentPrimary
    ? "https://" + view.currentPrimary.hostname
    : view.platformUrl;

  const actionMessage = useMemo(() => {
    switch (result.kind) {
      case "txt_pending":
        return t("txtNotReady");
      case "txt_verified":
        return t("txtVerified");
      case "cname_pending":
        return t("cnameNotReady");
      case "provisioning":
        return t("provisioning");
      case "provider_pending":
        return t("providerPending");
      case "activated":
        return t("activated");
      case "removed":
        return t("removed");
      case "claim_expired":
        return t("claimExpired");
      case "failed":
        return t("failed");
      case "not_found":
        return t("notFound");
      default:
        return null;
    }
  }, [result.kind, t]);

  function submit(
    action: (
      previousState: MerchantDomainActionState,
      formData: FormData
    ) => Promise<MerchantDomainActionState>,
    formData: FormData
  ) {
    startTransition(() => {
      void action(result, formData).then((next) => {
        setResult(next);
        router.refresh();
      });
    });
  }

  const setupHostname =
    view.claim?.hostname ?? view.candidate?.hostname ?? token?.hostname ?? null;
  const ownershipVerified = Boolean(view.claim?.verifiedAt);
  const cnameVerified = Boolean(
    view.claim?.cnameVerifiedAt || view.candidate
  );
  const providerReady = Boolean(
    view.currentPrimary &&
      (!view.candidate ||
        view.currentPrimary.hostname === view.candidate.hostname)
  );

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <h2 className="text-lg font-bold">{t("currentAddress")}</h2>
        <p className="mt-2 break-all font-mono text-sm">{activeAddress}</p>
        <p className="mt-3 text-sm text-muted-foreground">{t("abandonSafe")}</p>
        {view.retiring ? (
          <p className="mt-3 rounded-xl bg-muted px-4 py-3 text-sm">
            {t("retiringNotice", {
              hostname: view.retiring.hostname,
              target: view.retiring.redirectToHostname,
            })}
          </p>
        ) : null}
      </section>

      <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
        <h2 className="text-xl font-bold">{t("title")}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("setupIntro")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("dnsProviderHelp")}</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("dnsFieldHelp")}</p>

        <ol className="mt-6 grid gap-2 text-sm sm:grid-cols-4">
          <li className="rounded-lg border border-border p-3">
            1. {t("verifyOwnership")} {ownershipVerified ? "✓" : ""}
          </li>
          <li className="rounded-lg border border-border p-3">
            2. {t("verifyCname")} {cnameVerified ? "✓" : ""}
          </li>
          <li className="rounded-lg border border-border p-3">
            3. {t("provisionSsl")} {view.candidate ? "…" : ""}
          </li>
          <li className="rounded-lg border border-border p-3">
            4. {t("statusActive")} {providerReady ? "✓" : ""}
          </li>
        </ol>

        {actionMessage ? (
          <p role="status" className="mt-5 rounded-xl bg-muted px-4 py-3 text-sm">
            {actionMessage}
          </p>
        ) : null}

        {!view.claim && !view.candidate ? (
          <form
            className="mt-6 space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              submit(startDomainClaimAction, new FormData(event.currentTarget));
            }}
          >
            <input type="hidden" name="storeId" value={view.storeId} />
            <label className="grid gap-2 text-sm font-semibold">
              {t("domainLabel")}
              <input
                name="hostname"
                type="text"
                required
                placeholder="shop.example.com"
                className="min-h-11 rounded-lg border border-border bg-background px-3"
              />
            </label>
            <button
              type="submit"
              disabled={isPending}
              className="min-h-11 rounded-lg bg-foreground px-5 font-semibold text-background disabled:opacity-50"
            >
              {t("startSetup")}
            </button>
          </form>
        ) : null}

        {view.claim ? (
          <div className="mt-6 space-y-5">
            <h3 className="font-bold">{t("verifyOwnership")}</h3>

            {token ? (
              <div className="space-y-3">
                <div>
                  <p className="mb-1 text-sm font-semibold">{t("txtName")}</p>
                  <CopyValue value={token.dnsName} />
                </div>
                <div>
                  <p className="mb-1 text-sm font-semibold">{t("txtValue")}</p>
                  <CopyValue value={token.dnsValue} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("tokenExpires", {
                    time: new Date(token.expiresAt).toLocaleString(),
                  })}
                </p>
              </div>
            ) : view.claim.status === "pending_verification" ? (
              <div className="rounded-xl bg-muted px-4 py-3 text-sm">
                <p>{t("tokenNotStored")}</p>
                <form
                  className="mt-3"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const formData = new FormData(event.currentTarget);
                    formData.set("hostname", view.claim!.hostname);
                    submit(startDomainClaimAction, formData);
                  }}
                >
                  <input type="hidden" name="storeId" value={view.storeId} />
                  <button
                    type="submit"
                    disabled={isPending}
                    className="min-h-10 rounded-lg border border-border px-4 font-semibold"
                  >
                    {t("createNewCode")}
                  </button>
                </form>
              </div>
            ) : null}

            {view.claim.status === "pending_verification" ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  submit(checkDomainTxtAction, new FormData(event.currentTarget));
                }}
              >
                <input type="hidden" name="storeId" value={view.storeId} />
                <input type="hidden" name="hostname" value={view.claim.hostname} />
                <button
                  type="submit"
                  disabled={isPending || txtRemaining > 0}
                  className="min-h-11 rounded-lg bg-foreground px-5 font-semibold text-background disabled:opacity-50"
                >
                  {txtRemaining > 0
                    ? t("checkCountdown", { seconds: txtRemaining })
                    : t("checkNow")}
                </button>
              </form>
            ) : null}

            {ownershipVerified && !view.claim.cnameVerifiedAt ? (
              <div className="space-y-3 border-t border-border pt-5">
                <h3 className="font-bold">{t("verifyCname")}</h3>
                <p className="text-sm text-muted-foreground">{t("cnameHelp")}</p>
                <CopyValue
                  value={
                    setupHostname +
                    " CNAME customers.shopnest.co.il"
                  }
                />
                <p className="text-sm text-muted-foreground">
                  {t("cnameTarget")}: customers.shopnest.co.il
                </p>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    submit(
                      checkDomainCnameAction,
                      new FormData(event.currentTarget)
                    );
                  }}
                >
                  <input type="hidden" name="storeId" value={view.storeId} />
                  <input type="hidden" name="hostname" value={view.claim.hostname} />
                  <button
                    type="submit"
                    disabled={isPending || cnameRemaining > 0}
                    className="min-h-11 rounded-lg bg-foreground px-5 font-semibold text-background disabled:opacity-50"
                  >
                    {cnameRemaining > 0
                      ? t("checkCountdown", { seconds: cnameRemaining })
                      : t("checkCname")}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        ) : null}

        {view.candidate ? (
          <div className="mt-6 space-y-3 border-t border-border pt-5">
            <h3 className="font-bold">{t("provisionSsl")}</h3>
            <p className="text-sm">
              {t("hostnameStatus")}:{" "}
              {view.candidate.providerHostnameStatus ?? t("statusPending")}
            </p>
            <p className="text-sm">
              {t("sslStatus")}:{" "}
              {view.candidate.providerSslStatus ?? t("statusPending")}
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submit(
                  checkDomainProviderAction,
                  new FormData(event.currentTarget)
                );
              }}
            >
              <input type="hidden" name="storeId" value={view.storeId} />
              <button
                type="submit"
                disabled={isPending || providerRemaining > 0}
                className="min-h-11 rounded-lg bg-foreground px-5 font-semibold text-background disabled:opacity-50"
              >
                {providerRemaining > 0
                  ? t("checkCountdown", { seconds: providerRemaining })
                  : t("checkStatus")}
              </button>
            </form>
          </div>
        ) : null}

        {view.currentPrimary ? (
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-sm text-muted-foreground">
              {t("txtCleanup")}
            </p>
            <p className="mt-2 text-sm font-semibold">{t("keepCname")}</p>
            {!view.candidate && !view.claim && !view.retiring ? (
              <form
                className="mt-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const formData = new FormData(event.currentTarget);
                  formData.set("hostname", view.currentPrimary!.hostname);
                  submit(removeDomainAction, formData);
                }}
              >
                <input type="hidden" name="storeId" value={view.storeId} />
                <button
                  type="submit"
                  disabled={isPending}
                  className="min-h-11 rounded-lg border border-border px-5 font-semibold"
                >
                  {t("removeDomain")}
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
