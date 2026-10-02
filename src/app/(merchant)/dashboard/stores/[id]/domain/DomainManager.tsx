"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ManagementInput } from "@/components/management/ManagementInput";
import {
  MERCHANT_DOMAIN_CHECK_COOLDOWN_MS,
  merchantDomainProgress,
  type MerchantDomainActionState,
  type MerchantDomainView,
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
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded-lg bg-muted px-3 py-2 text-sm">
        {value}
      </code>
      <Button
        type="button"
        variant="outline"
        size="management"
        onClick={() => void navigator.clipboard.writeText(value)}
        aria-label={t("copy")}
        title={t("copy")}
        className="w-11 shrink-0 px-0"
      >
        <Copy className="size-4" aria-hidden="true" />
      </Button>
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

  const [token, setToken] =
    useState<MerchantDomainActionState["token"]>(undefined);

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

  const cooldownSeconds = MERCHANT_DOMAIN_CHECK_COOLDOWN_MS / 1000;
  const txtRemaining = Math.min(
    cooldownSeconds,
    remainingSeconds(txtNext, now)
  );
  const cnameRemaining = Math.min(
    cooldownSeconds,
    remainingSeconds(cnameNext, now)
  );
  const providerRemaining = Math.min(
    cooldownSeconds,
    remainingSeconds(providerNext, now)
  );

  const activeAddress = view.currentPrimary
    ? "https://" + view.currentPrimary.hostname
    : view.platformUrl;

  const claimExpiresAt = view.claim
    ? new Date(view.claim.expiresAt).getTime()
    : null;
  const claimRemainingMinutes =
    claimExpiresAt === null
      ? 0
      : Math.max(0, Math.ceil((claimExpiresAt - now) / 60_000));
  const claimRemainingHours = Math.floor(claimRemainingMinutes / 60);
  const claimRemainingMinutePart = claimRemainingMinutes % 60;

  const actionNeedsAttention =
    result.kind === "txt_pending" ||
    result.kind === "cname_pending" ||
    result.kind === "claim_expired" ||
    result.kind === "failed" ||
    result.kind === "not_found";

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
    action: (formData: FormData) => Promise<MerchantDomainActionState>,
    formData: FormData
  ) {
    startTransition(() => {
      void action(formData).then((next) => {
        if (next.kind === "claim_started" && next.token) {
          setToken(next.token);
        } else if (
          next.kind === "txt_verified" ||
          next.kind === "claim_expired" ||
          next.kind === "not_found"
        ) {
          setToken(undefined);
        }

        setResult(next);
        router.refresh();
      });
    });
  }

  const {
    ownershipVerified,
    cnameVerified,
    active: providerReady,
  } = merchantDomainProgress(view);

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
            3. {t("provisionSsl")}{" "}
            {providerReady ? "✓" : view.candidate ? "…" : ""}
          </li>
          <li className="rounded-lg border border-border p-3">
            4. {t("statusActive")} {providerReady ? "✓" : ""}
          </li>
        </ol>

        {actionMessage ? (
          <p
            role={actionNeedsAttention ? "alert" : "status"}
            className={
              "mt-5 rounded-xl px-4 py-3 text-sm " +
              (actionNeedsAttention
                ? "bg-destructive/10 font-semibold text-destructive ring-1 ring-destructive/20"
                : "bg-muted")
            }
          >
            {actionMessage}
          </p>
        ) : null}

        {!view.claim && !view.candidate && !view.retiring ? (
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
              <ManagementInput
                name="hostname"
                type="text"
                required
                placeholder="shop.example.com"
              />
            </label>
            <Button
              type="submit"
              size="management"
              disabled={isPending}
              className="px-5"
            >
              {t("startSetup")}
            </Button>
          </form>
        ) : null}

        {view.claim ? (
          <div className="mt-6 space-y-5">
            <h3 className="font-bold">{t("verifyOwnership")}</h3>
            <div className="rounded-xl bg-muted px-4 py-3 text-sm">
              {claimExpiresAt !== null && claimExpiresAt <= now ? (
                <p className="font-semibold text-destructive">
                  {t("claimExpired")}
                </p>
              ) : (
                <>
                  <p className="font-semibold">
                    {t("claimDeadline", {
                      time: new Date(view.claim.expiresAt).toLocaleString(),
                    })}
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {t("claimTimeRemaining", {
                      hours: claimRemainingHours,
                      minutes: claimRemainingMinutePart,
                    })}
                  </p>
                </>
              )}
            </div>

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
                  <Button
                    type="submit"
                    variant="outline"
                    size="management"
                    disabled={isPending}
                    className="px-4"
                  >
                    {t("createNewCode")}
                  </Button>
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
                <Button
                  type="submit"
                  size="management"
                  disabled={isPending || txtRemaining > 0}
                  className="px-5"
                >
                  {txtRemaining > 0
                    ? t("checkCountdown", { seconds: txtRemaining })
                    : t("checkNow")}
                </Button>
              </form>
            ) : null}

            {ownershipVerified && !view.claim.cnameVerifiedAt ? (
              <div className="space-y-3 border-t border-border pt-5">
                <h3 className="font-bold">{t("verifyCname")}</h3>
                <p className="text-sm text-muted-foreground">{t("cnameHelp")}</p>

                <div className="grid gap-4">
                  <div>
                    <p className="mb-1 text-sm font-semibold">
                      {t("cnameHostname")}
                    </p>
                    <CopyValue value={view.claim.hostname} />
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {t("cnameHostnameHelp")}
                    </p>
                  </div>

                  <div>
                    <p className="mb-1 text-sm font-semibold">
                      {t("cnameTargetHostname")}
                    </p>
                    <CopyValue value="customers.shopnest.co.il." />
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">
                      {t("cnameTargetHelp")}
                    </p>
                  </div>
                </div>
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
                  <Button
                    type="submit"
                    size="management"
                    disabled={isPending || cnameRemaining > 0}
                    className="px-5"
                  >
                    {cnameRemaining > 0
                      ? t("checkCountdown", { seconds: cnameRemaining })
                      : t("checkCname")}
                  </Button>
                </form>
              </div>
            ) : null}

            {ownershipVerified &&
            view.claim.cnameVerifiedAt &&
            !view.candidate ? (
              <div className="space-y-3 border-t border-border pt-5">
                <h3 className="font-bold">{t("provisionSsl")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("provisioningRetryHelp")}
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
                  <Button
                    type="submit"
                    size="management"
                    disabled={isPending || cnameRemaining > 0}
                    className="px-5"
                  >
                    {cnameRemaining > 0
                      ? t("checkCountdown", { seconds: cnameRemaining })
                      : t("retryProvisioning")}
                  </Button>
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
              <Button
                type="submit"
                size="management"
                disabled={isPending || providerRemaining > 0}
                className="px-5"
              >
                {providerRemaining > 0
                  ? t("checkCountdown", { seconds: providerRemaining })
                  : t("checkStatus")}
              </Button>
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
                  if (!window.confirm(t("removeConfirm"))) return;
                  const formData = new FormData(event.currentTarget);
                  formData.set("hostname", view.currentPrimary!.hostname);
                  submit(removeDomainAction, formData);
                }}
              >
                <input type="hidden" name="storeId" value={view.storeId} />
                <Button
                  type="submit"
                  variant="outline"
                  size="management"
                  disabled={isPending}
                  className="border-red-200 px-5 text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800"
                >
                  {t("removeDomain")}
                </Button>
              </form>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
