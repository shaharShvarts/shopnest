"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/admin-auth/server";
import { updateControlPlaneStore } from "@/lib/control-plane/server";
import { rollbackRetiringDomainForAdmin } from "@/lib/custom-domain-lifecycle/server";
import { validateClaimHostname } from "@/lib/domain-claims/core";

const formSchema = z.object({
  slug: z.string().trim().min(1).max(63),
  status: z.enum(["active", "suspended", "disabled"]),
  featured: z.boolean(),
  featuredRank: z.number().int().positive().nullable(),
  supportNotes: z.string().trim().max(4000).nullable(),
});

export async function updateStoreAction(formData: FormData) {
  const rankValue = formData.get("featuredRank");
  const parsed = formSchema.safeParse({
    slug: formData.get("slug"),
    status: formData.get("status"),
    featured: formData.get("featured") === "on",
    featuredRank:
      typeof rankValue === "string" && rankValue.trim()
        ? Number(rankValue)
        : null,
    supportNotes:
      typeof formData.get("supportNotes") === "string" &&
      String(formData.get("supportNotes")).trim()
        ? String(formData.get("supportNotes")).trim()
        : null,
  });

  if (!parsed.success) {
    return { ok: false as const, code: "invalid" };
  }

  try {
    await updateControlPlaneStore(parsed.data);
  } catch {
    return { ok: false as const, code: "failed" };
  }

  revalidatePath("/admin");
  revalidatePath("/admin/stores");
  revalidatePath(`/admin/stores/${parsed.data.slug}`);
  revalidatePath("/admin/plans");
  revalidatePath("/admin/featured");
  return { ok: true as const, code: "saved" };
}

export async function rollbackCustomDomainAction(formData: FormData) {
  await requireSuperAdmin();

  let tenantSlug: string;
  let restoreHostname: string;
  try {
    tenantSlug = z
      .string()
      .trim()
      .min(1)
      .max(63)
      .parse(formData.get("tenantSlug"));
    restoreHostname = validateClaimHostname(
      formData.get("restoreHostname")
    );
  } catch {
    return { ok: false as const, code: "invalid" };
  }

  try {
    await rollbackRetiringDomainForAdmin(
      tenantSlug,
      restoreHostname,
      new Date()
    );
  } catch {
    return { ok: false as const, code: "failed" };
  }

  revalidatePath("/admin/stores/" + tenantSlug);
  return { ok: true as const, code: "rolled_back" };
}
