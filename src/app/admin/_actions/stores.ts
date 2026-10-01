"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSuperAdmin } from "@/lib/admin-auth/server";
import { updateControlPlaneStore } from "@/lib/control-plane/server";
import { rollbackRetiringDomainForAdmin } from "@/lib/custom-domain-lifecycle/server";
import { validateClaimHostname } from "@/lib/domain-claims/core";

const formSchema = z.object({
  slug: z.string().trim().min(1).max(63),
  status: z.enum(["active", "suspended", "disabled"]),
  plan: z.enum(["small", "medium", "large"]),
  featured: z.boolean(),
  featuredRank: z.number().int().positive().nullable(),
  supportNotes: z.string().trim().max(4000).nullable(),
});

export async function updateStoreAction(formData: FormData) {
  const rankValue = formData.get("featuredRank");
  const parsed = formSchema.safeParse({
    slug: formData.get("slug"),
    status: formData.get("status"),
    plan: formData.get("plan"),
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
  if (!parsed.success) throw new Error("Invalid store update");
  await updateControlPlaneStore(parsed.data);
  revalidatePath("/admin");
  revalidatePath("/admin/stores");
  revalidatePath(`/admin/stores/${parsed.data.slug}`);
  revalidatePath("/admin/plans");
  revalidatePath("/admin/featured");
  redirect(`/admin/stores/${parsed.data.slug}?saved=1`);
}


export async function rollbackCustomDomainAction(formData: FormData) {
  await requireSuperAdmin();

  const tenantSlug = z
    .string()
    .trim()
    .min(1)
    .max(63)
    .parse(formData.get("tenantSlug"));
  const restoreHostname = validateClaimHostname(
    formData.get("restoreHostname")
  );

  await rollbackRetiringDomainForAdmin(
    tenantSlug,
    restoreHostname,
    new Date()
  );

  revalidatePath("/admin/stores/" + tenantSlug);
  redirect(
    "/admin/stores/" + tenantSlug + "?domainRollback=1"
  );
}
