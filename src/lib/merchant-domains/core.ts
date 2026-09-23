export const MERCHANT_DOMAIN_CHECK_COOLDOWN_MS = 60_000;

export type MerchantDomainView = {
  storeId: number;
  storeSlug: string;
  platformUrl: string;
  currentPrimary: {
    hostname: string;
  } | null;
  retiring: {
    hostname: string;
    redirectToHostname: string;
    retireAt: string;
  } | null;
  candidate: {
    hostname: string;
    providerHostnameStatus: string | null;
    providerSslStatus: string | null;
    nextProviderCheckAt: string | null;
  } | null;
  claim: {
    hostname: string;
    status: "pending_verification" | "verified";
    expiresAt: string;
    verifiedAt: string | null;
    cnameVerifiedAt: string | null;
    nextTxtCheckAt: string | null;
    nextCnameCheckAt: string | null;
  } | null;
};

export type MerchantDomainRecord = {
  storeId: number;
  storeSlug: string;
  tenantId: number | null;
  currentPrimary: {
    id: number;
    hostname: string;
  } | null;
  retiring: {
    id: number;
    hostname: string;
    redirectToDomainId: number;
    retireAt: Date;
  } | null;
  candidate: {
    id: number;
    hostname: string;
    providerHostnameStatus: string | null;
    providerSslStatus: string | null;
    lastManualCheckAt: Date | null;
  } | null;
  claim: {
    hostname: string;
    status: "pending_verification" | "verified";
    expiresAt: Date;
    verifiedAt: Date | null;
    cnameVerifiedAt: Date | null;
    lastTxtCheckAt: Date | null;
    lastCnameCheckAt: Date | null;
  } | null;
};

export interface MerchantDomainRepository {
  findForOwnedStore(
    merchantId: number,
    storeId: number
  ): Promise<MerchantDomainRecord | null>;
}

export type MerchantDomainActionKind =
  | "idle"
  | "claim_started"
  | "txt_pending"
  | "txt_verified"
  | "cname_pending"
  | "provisioning"
  | "provider_pending"
  | "activated"
  | "removed"
  | "cooldown"
  | "claim_expired"
  | "not_found"
  | "failed";

export type MerchantDomainActionState = {
  kind: MerchantDomainActionKind;
  token?: {
    hostname: string;
    dnsName: string;
    dnsValue: string;
    expiresAt: string;
  };
  nextAllowedAt?: string;
  providerHostnameStatus?: string;
  providerSslStatus?: string | null;
};

export const EMPTY_MERCHANT_DOMAIN_ACTION_STATE: MerchantDomainActionState = {
  kind: "idle",
};

function nextCheckAt(lastCheckedAt: Date | null, now: Date) {
  if (!lastCheckedAt) return null;
  const next = new Date(
    lastCheckedAt.getTime() + MERCHANT_DOMAIN_CHECK_COOLDOWN_MS
  );
  return next.getTime() > now.getTime() ? next.toISOString() : null;
}

export function merchantDomainViewFromRecord(
  record: MerchantDomainRecord,
  now = new Date()
): MerchantDomainView {
  const redirectTarget =
    record.retiring && record.currentPrimary &&
    record.retiring.redirectToDomainId === record.currentPrimary.id
      ? record.currentPrimary.hostname
      : null;

  return {
    storeId: record.storeId,
    storeSlug: record.storeSlug,
    platformUrl: `https://shopnest.co.il/${record.storeSlug}`,
    currentPrimary: record.currentPrimary
      ? { hostname: record.currentPrimary.hostname }
      : null,
    retiring:
      record.retiring && redirectTarget
        ? {
            hostname: record.retiring.hostname,
            redirectToHostname: redirectTarget,
            retireAt: record.retiring.retireAt.toISOString(),
          }
        : null,
    candidate: record.candidate
      ? {
          hostname: record.candidate.hostname,
          providerHostnameStatus: record.candidate.providerHostnameStatus,
          providerSslStatus: record.candidate.providerSslStatus,
          nextProviderCheckAt: nextCheckAt(
            record.candidate.lastManualCheckAt,
            now
          ),
        }
      : null,
    claim: record.claim
      ? {
          hostname: record.claim.hostname,
          status: record.claim.status,
          expiresAt: record.claim.expiresAt.toISOString(),
          verifiedAt: record.claim.verifiedAt?.toISOString() ?? null,
          cnameVerifiedAt:
            record.claim.cnameVerifiedAt?.toISOString() ?? null,
          nextTxtCheckAt: nextCheckAt(record.claim.lastTxtCheckAt, now),
          nextCnameCheckAt: nextCheckAt(record.claim.lastCnameCheckAt, now),
        }
      : null,
  };
}
