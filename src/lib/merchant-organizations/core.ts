import { z } from "zod";

const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .optional()
    .default("")
    .transform((value) => value || null);

const optionalEmail = z
  .string()
  .trim()
  .max(320)
  .optional()
  .default("")
  .refine(
    (value) => value === "" || z.string().email().safeParse(value).success
  )
  .transform((value) => value || null);

export const organizationProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160),
    legalName: optionalText(200),
    businessNumber: optionalText(64),
    vatNumber: optionalText(64),
    email: optionalEmail,
    phone: optionalText(64),
    country: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{2}$/)
      .default("IL"),
  })
  .strip();

export type OrganizationRole = "owner";

export type OrganizationProfile = z.infer<typeof organizationProfileSchema>;

export type MerchantOrganization = OrganizationProfile & {
  id: number;
  role: OrganizationRole;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateFirstOrganizationResult =
  | { kind: "created"; organization: MerchantOrganization }
  | { kind: "already_exists"; organization: MerchantOrganization };

export interface OrganizationRepository {
  findFirstForMerchant(
    merchantId: number
  ): Promise<MerchantOrganization | null>;

  createFirstWithOwner(
    merchantId: number,
    profile: OrganizationProfile
  ): Promise<CreateFirstOrganizationResult>;

  updateOwned(
    merchantId: number,
    organizationId: number,
    profile: OrganizationProfile
  ): Promise<MerchantOrganization | null>;
}

export function parseOrganizationProfile(input: unknown): OrganizationProfile {
  const parsed = organizationProfileSchema.safeParse(input);
  if (!parsed.success) throw new Error("invalid_organization_profile");
  return parsed.data;
}

export function canMutateOrganization(role: string) {
  return role === "owner";
}
