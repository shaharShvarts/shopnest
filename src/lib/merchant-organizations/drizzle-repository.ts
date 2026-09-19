import { and, asc, eq } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/db";
import {
  merchantAccounts,
  organizationMemberships,
  organizations,
} from "@/drizzle/control-plane-schema";
import type {
  CreateFirstOrganizationResult,
  MerchantOrganization,
  OrganizationProfile,
  OrganizationRepository,
} from "./core";

const organizationSelection = {
  id: organizations.id,
  displayName: organizations.displayName,
  legalName: organizations.legalName,
  businessNumber: organizations.businessNumber,
  vatNumber: organizations.vatNumber,
  email: organizations.email,
  phone: organizations.phone,
  country: organizations.country,
  role: organizationMemberships.role,
  createdAt: organizations.createdAt,
  updatedAt: organizations.updatedAt,
};

function asMerchantOrganization(row: {
  id: number;
  displayName: string;
  legalName: string | null;
  businessNumber: string | null;
  vatNumber: string | null;
  email: string | null;
  phone: string | null;
  country: string;
  role: string;
  createdAt: Date;
  updatedAt: Date;
}): MerchantOrganization | null {
  if (row.role !== "owner") return null;
  return {
    id: row.id,
    displayName: row.displayName,
    legalName: row.legalName,
    businessNumber: row.businessNumber,
    vatNumber: row.vatNumber,
    email: row.email,
    phone: row.phone,
    country: row.country,
    role: "owner",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class DrizzleOrganizationRepository implements OrganizationRepository {
  async findFirstForMerchant(merchantId: number) {
    const [row] = await getControlPlaneDb()
      .select(organizationSelection)
      .from(organizationMemberships)
      .innerJoin(
        organizations,
        eq(organizationMemberships.organizationId, organizations.id)
      )
      .where(eq(organizationMemberships.merchantAccountId, merchantId))
      .orderBy(asc(organizationMemberships.createdAt), asc(organizations.id))
      .limit(1);

    return row ? asMerchantOrganization(row) : null;
  }

  createFirstWithOwner(
    merchantId: number,
    profile: OrganizationProfile
  ): Promise<CreateFirstOrganizationResult> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [merchant] = await tx
        .select({ id: merchantAccounts.id })
        .from(merchantAccounts)
        .where(eq(merchantAccounts.id, merchantId))
        .limit(1)
        .for("update");

      if (!merchant) throw new Error("merchant_missing");

      const [existingRow] = await tx
        .select(organizationSelection)
        .from(organizationMemberships)
        .innerJoin(
          organizations,
          eq(organizationMemberships.organizationId, organizations.id)
        )
        .where(eq(organizationMemberships.merchantAccountId, merchantId))
        .orderBy(asc(organizationMemberships.createdAt), asc(organizations.id))
        .limit(1);

      if (existingRow) {
        const existing = asMerchantOrganization(existingRow);
        if (!existing) throw new Error("unsupported_membership_role");
        return { kind: "already_exists", organization: existing };
      }

      const [organization] = await tx
        .insert(organizations)
        .values(profile)
        .returning({
          id: organizations.id,
          displayName: organizations.displayName,
          legalName: organizations.legalName,
          businessNumber: organizations.businessNumber,
          vatNumber: organizations.vatNumber,
          email: organizations.email,
          phone: organizations.phone,
          country: organizations.country,
          createdAt: organizations.createdAt,
          updatedAt: organizations.updatedAt,
        });

      await tx.insert(organizationMemberships).values({
        organizationId: organization.id,
        merchantAccountId: merchantId,
        role: "owner",
      });

      return {
        kind: "created",
        organization: {
          ...organization,
          role: "owner",
        },
      };
    });
  }

  updateOwned(
    merchantId: number,
    organizationId: number,
    profile: OrganizationProfile
  ): Promise<MerchantOrganization | null> {
    return getControlPlaneDb().transaction(async (tx) => {
      const [membership] = await tx
        .select({ role: organizationMemberships.role })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.merchantAccountId, merchantId),
            eq(organizationMemberships.organizationId, organizationId),
            eq(organizationMemberships.role, "owner")
          )
        )
        .limit(1)
        .for("update");

      if (!membership) return null;

      const [organization] = await tx
        .update(organizations)
        .set({
          ...profile,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, organizationId))
        .returning({
          id: organizations.id,
          displayName: organizations.displayName,
          legalName: organizations.legalName,
          businessNumber: organizations.businessNumber,
          vatNumber: organizations.vatNumber,
          email: organizations.email,
          phone: organizations.phone,
          country: organizations.country,
          createdAt: organizations.createdAt,
          updatedAt: organizations.updatedAt,
        });

      return organization
        ? {
            ...organization,
            role: "owner",
          }
        : null;
    });
  }
}
