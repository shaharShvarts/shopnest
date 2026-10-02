"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCloudflareDomainProvisioningService } from "@/lib/cloudflare-saas/domain-provisioning-server";
import { getCloudflareDomainRemovalService } from "@/lib/cloudflare-saas/domain-removal-server";
import {
  getCustomDomainLifecycleService,
  rollbackRetiringDomainForOwner,
} from "@/lib/custom-domain-lifecycle/server";
import { getDomainOwnershipClaimService } from "@/lib/domain-claims/server";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import type { MerchantDomainActionState } from "@/lib/merchant-domains/core";
import { getMerchantDomainView } from "@/lib/merchant-domains/server";
import { parseStoreId } from "@/lib/merchant-stores/core";
import { storeHasBooleanEntitlement } from "@/lib/store-entitlements/server";

const rollbackDomainSchema = z.object({
  storeId: z.coerce.number().int().positive(),
});

function storeIdFrom(formData: FormData) {
  return parseStoreId(formData.get("storeId"));
}

function hostnameFrom(formData: FormData) {
  const value = formData.get("hostname");
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("invalid_custom_domain_hostname");
  }
  return value;
}

function pathFor(storeId: number) {
  return "/dashboard/stores/" + storeId + "/domain";
}

async function requireCustomDomainEntitlement(storeId: number) {
  if (!(await storeHasBooleanEntitlement(storeId, "custom_domain"))) {
    throw new Error("custom_domain_entitlement_required");
  }
}

function cooldown(nextAllowedAt: Date): MerchantDomainActionState {
  return {
    kind: "cooldown",
    nextAllowedAt: nextAllowedAt.toISOString(),
  };
}

export async function startDomainClaimAction(
  formData: FormData
): Promise<MerchantDomainActionState> {
  const merchant = await requireMerchantPage();

  try {
    const storeId = storeIdFrom(formData);
    await requireCustomDomainEntitlement(storeId);
    const result = await getDomainOwnershipClaimService().startClaim(
      merchant.id,
      storeId,
      hostnameFrom(formData)
    );

    revalidatePath(pathFor(storeId));
    return {
      kind: "claim_started",
      token: {
        hostname: result.hostname,
        dnsName: result.dnsName,
        dnsValue: result.dnsValue,
        expiresAt: result.expiresAt.toISOString(),
      },
    };
  } catch {
    return { kind: "failed" };
  }
}

export async function checkDomainTxtAction(
  formData: FormData
): Promise<MerchantDomainActionState> {
  const merchant = await requireMerchantPage();

  try {
    const storeId = storeIdFrom(formData);
    await requireCustomDomainEntitlement(storeId);
    const result = await getDomainOwnershipClaimService().verifyClaim(
      merchant.id,
      storeId,
      hostnameFrom(formData)
    );

    revalidatePath(pathFor(storeId));

    if (result.kind === "cooldown") return cooldown(result.nextAllowedAt);
    if (result.kind === "expired") return { kind: "claim_expired" };
    if (result.kind === "verified") return { kind: "txt_verified" };
    if (result.kind === "not_found") return { kind: "not_found" };
    return { kind: "txt_pending" };
  } catch {
    return { kind: "failed" };
  }
}

export async function checkDomainCnameAction(
  formData: FormData
): Promise<MerchantDomainActionState> {
  const merchant = await requireMerchantPage();

  try {
    const storeId = storeIdFrom(formData);
    await requireCustomDomainEntitlement(storeId);
    const hostname = hostnameFrom(formData);
    const result = await getDomainOwnershipClaimService().verifyCname(
      merchant.id,
      storeId,
      hostname
    );

    if (result.kind === "cooldown") {
      revalidatePath(pathFor(storeId));
      return cooldown(result.nextAllowedAt);
    }
    if (result.kind === "expired") {
      revalidatePath(pathFor(storeId));
      return { kind: "claim_expired" };
    }
    if (result.kind === "not_found" || result.kind === "not_verified") {
      revalidatePath(pathFor(storeId));
      return { kind: "not_found" };
    }
    if (result.kind === "pending") {
      revalidatePath(pathFor(storeId));
      return {
        kind: "cname_pending",
        nextAllowedAt: result.nextAllowedAt.toISOString(),
      };
    }

    const provisioned =
      await getCloudflareDomainProvisioningService().provisionVerifiedClaim(
        merchant.id,
        storeId,
        hostname
      );

    revalidatePath(pathFor(storeId));

    if (provisioned.kind === "in_progress") {
      return { kind: "provisioning" };
    }

    return {
      kind: "provisioning",
      providerHostnameStatus: provisioned.providerHostnameStatus,
      providerSslStatus: provisioned.providerSslStatus,
    };
  } catch {

    return { kind: "failed" };
  }
}

export async function checkDomainProviderAction(
  formData: FormData
): Promise<MerchantDomainActionState> {
  const merchant = await requireMerchantPage();

  try {
    const storeId = storeIdFrom(formData);
    await requireCustomDomainEntitlement(storeId);
    const result =
      await getCustomDomainLifecycleService().checkOwnedCandidate(
        merchant.id,
        storeId
      );

    revalidatePath(pathFor(storeId));

    if (result.kind === "cooldown") return cooldown(result.nextAllowedAt);
    if (result.kind === "not_found") return { kind: "not_found" };
    if (result.kind === "activated") return { kind: "activated" };

    return {
      kind: "provider_pending",
      nextAllowedAt: result.nextAllowedAt.toISOString(),
      providerHostnameStatus: result.providerHostnameStatus,
      providerSslStatus: result.providerSslStatus,
    };
  } catch {
    return { kind: "failed" };
  }
}

export async function removeDomainAction(
  formData: FormData
): Promise<MerchantDomainActionState> {
  const merchant = await requireMerchantPage();

  try {
    const storeId = storeIdFrom(formData);
    const view = await getMerchantDomainView(merchant.id, storeId);
    const hostname = view?.currentPrimary?.hostname;

    if (!hostname) return { kind: "not_found" };

    await getCloudflareDomainRemovalService().removeOwnedDomain(
      merchant.id,
      storeId,
      hostname
    );

    revalidatePath(pathFor(storeId));
    revalidatePath("/dashboard/stores/" + storeId);
    return { kind: "removed" };
  } catch {
    return { kind: "failed" };
  }
}


export async function rollbackDomainAction(
  formData: FormData
): Promise<void> {
  const merchant = await requireMerchantPage();

  const parsed = rollbackDomainSchema.parse({
    storeId: formData.get("storeId"),
  });

  await rollbackRetiringDomainForOwner(
    merchant.id,
    parsed.storeId
  );

  revalidatePath(pathFor(parsed.storeId));
  revalidatePath("/dashboard/stores/" + parsed.storeId);
  redirect(pathFor(parsed.storeId) + "?rollback=1");
}
