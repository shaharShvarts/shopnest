"use server";

import { revalidatePath } from "next/cache";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { getDomainOwnershipClaimService } from "@/lib/domain-claims/server";
import { getCloudflareDomainProvisioningService } from "@/lib/cloudflare-saas/domain-provisioning-server";
import { getCustomDomainLifecycleService } from "@/lib/custom-domain-lifecycle/server";
import { getCloudflareDomainRemovalService } from "@/lib/cloudflare-saas/domain-removal-server";
import type { MerchantDomainActionState } from "@/lib/merchant-domains/core";

function pathFor(storeId: number) {
  return "/dashboard/stores/" + storeId + "/domain";
}

function hostnameFrom(formData: FormData) {
  const value = formData.get("hostname");
  if (typeof value !== "string") {
    throw new Error("invalid_hostname");
  }
  return value;
}

function failure(): MerchantDomainActionState {
  return { kind: "failed" };
}

export async function startDomainClaimAction(
  formData: FormData
): Promise<MerchantDomainActionState> {
  const merchant = await requireMerchantPage();

  let storeId: number;
  try {
    storeId = parseStoreId(formData.get("storeId"));
    const started = await getDomainOwnershipClaimService().startClaim(
      merchant.id,
      storeId,
      hostnameFrom(formData)
    );
    revalidatePath(pathFor(storeId));
    return {
      kind: "claim_started",
      token: {
        hostname: started.hostname,
        dnsName: started.dnsName,
        dnsValue: started.dnsValue,
        expiresAt: started.expiresAt.toISOString(),
      },
    };
  } catch {
    return failure();
  }
}

export async function checkDomainTxtAction(
  formData: FormData
): Promise<MerchantDomainActionState> {
  const merchant = await requireMerchantPage();

  try {
    const storeId = parseStoreId(formData.get("storeId"));
    const result = await getDomainOwnershipClaimService().verifyClaim(
      merchant.id,
      storeId,
      hostnameFrom(formData)
    );
    revalidatePath(pathFor(storeId));

    if (result.kind === "cooldown") {
      return {
        kind: "cooldown",
        nextAllowedAt: result.nextAllowedAt.toISOString(),
      };
    }
    if (result.kind === "expired") {
      return { kind: "claim_expired" };
    }
    if (result.kind === "verified") {
      return { kind: "txt_verified" };
    }
    if (result.kind === "not_found") {
      return { kind: "not_found" };
    }
    return { kind: "txt_pending" };
  } catch {
    return failure();
  }
}

export async function checkDomainCnameAction(
  formData: FormData
): Promise<MerchantDomainActionState> {
  const merchant = await requireMerchantPage();

  try {
    const storeId = parseStoreId(formData.get("storeId"));
    const hostname = hostnameFrom(formData);
    const verified = await getDomainOwnershipClaimService().verifyCname(
      merchant.id,
      storeId,
      hostname
    );

    if (verified.kind === "cooldown") {
      return {
        kind: "cooldown",
        nextAllowedAt: verified.nextAllowedAt.toISOString(),
      };
    }
    if (verified.kind === "expired") {
      return { kind: "claim_expired" };
    }
    if (verified.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (verified.kind !== "verified") {
      return { kind: "cname_pending" };
    }

    const provisioned =
      await getCloudflareDomainProvisioningService()
        .provisionVerifiedClaim(merchant.id, storeId, hostname);

    revalidatePath(pathFor(storeId));

    if (provisioned.kind === "in_progress") {
      return { kind: "provisioning" };
    }

    return {
      kind: "provisioning",
      providerHostnameStatus:
        provisioned.providerHostnameStatus,
      providerSslStatus: provisioned.providerSslStatus,
    };
  } catch {
    return failure();
  }
}

export async function checkDomainProviderAction(
  formData: FormData
): Promise<MerchantDomainActionState> {
  const merchant = await requireMerchantPage();

  try {
    const storeId = parseStoreId(formData.get("storeId"));
    const result =
      await getCustomDomainLifecycleService().checkOwnedCandidate(
        merchant.id,
        storeId
      );

    revalidatePath(pathFor(storeId));

    if (result.kind === "cooldown") {
      return {
        kind: "cooldown",
        nextAllowedAt: result.nextAllowedAt.toISOString(),
      };
    }
    if (result.kind === "not_found") {
      return { kind: "not_found" };
    }
    if (result.kind === "pending") {
      return {
        kind: "provider_pending",
        nextAllowedAt: result.nextAllowedAt.toISOString(),
        providerHostnameStatus:
          result.providerHostnameStatus,
        providerSslStatus: result.providerSslStatus,
      };
    }
    return { kind: "activated" };
  } catch {
    return failure();
  }
}

export async function removeDomainAction(
  formData: FormData
): Promise<MerchantDomainActionState> {
  const merchant = await requireMerchantPage();

  try {
    const storeId = parseStoreId(formData.get("storeId"));
    await getCloudflareDomainRemovalService().removeOwnedDomain(
      merchant.id,
      storeId,
      hostnameFrom(formData)
    );
    revalidatePath(pathFor(storeId));
    revalidatePath("/dashboard/stores/" + storeId);
    return { kind: "removed" };
  } catch {
    return failure();
  }
}
