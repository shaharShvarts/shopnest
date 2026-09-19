"use server";

import { redirect } from "next/navigation";
import { requireMerchantPage } from "@/lib/merchant-auth/server";
import { organizationProfileSchema } from "@/lib/merchant-organizations/core";
import { getMerchantOrganizationRepository } from "@/lib/merchant-organizations/server";

export type OrganizationActionState = {
  success: false;
  message?: "invalidBusinessDetails" | "businessUnavailable";
  errors?: Record<string, string[] | undefined>;
};

export async function createOrganizationAction(
  _state: OrganizationActionState,
  formData: FormData
): Promise<OrganizationActionState> {
  const merchant = await requireMerchantPage();
  const parsed = organizationProfileSchema.safeParse(
    Object.fromEntries(formData)
  );

  if (!parsed.success) {
    return {
      success: false,
      message: "invalidBusinessDetails",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  await getMerchantOrganizationRepository().createFirstWithOwner(
    merchant.id,
    parsed.data
  );

  redirect("/dashboard/business");
}

export async function updateOrganizationAction(
  _state: OrganizationActionState,
  formData: FormData
): Promise<OrganizationActionState> {
  const merchant = await requireMerchantPage();
  const parsed = organizationProfileSchema.safeParse(
    Object.fromEntries(formData)
  );

  if (!parsed.success) {
    return {
      success: false,
      message: "invalidBusinessDetails",
      errors: parsed.error.flatten().fieldErrors,
    };
  }

  const repository = getMerchantOrganizationRepository();
  const current = await repository.findFirstForMerchant(merchant.id);

  if (!current) {
    redirect("/dashboard/business/new");
  }

  const updated = await repository.updateOwned(
    merchant.id,
    current.id,
    parsed.data
  );

  if (!updated) {
    return {
      success: false,
      message: "businessUnavailable",
    };
  }

  redirect("/dashboard/business");
}
