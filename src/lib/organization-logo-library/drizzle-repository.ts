import "server-only";

import { and, asc, eq, isNull } from "drizzle-orm";
import { getControlPlaneDb } from "@/drizzle/control-db";
import { organizationLogoAssets } from "@/drizzle/control-schema/organizationLogoAsset";

const selection = {
  id: organizationLogoAssets.id,
  organizationId: organizationLogoAssets.organizationId,
  contentHash: organizationLogoAssets.contentHash,
  filename: organizationLogoAssets.filename,
  contentType: organizationLogoAssets.contentType,
  byteSize: organizationLogoAssets.byteSize,
  archivedAt: organizationLogoAssets.archivedAt,
  createdAt: organizationLogoAssets.createdAt,
};

export class DrizzleOrganizationLogoRepository {
  async listActive(organizationId: number) {
    return getControlPlaneDb()
      .select(selection)
      .from(organizationLogoAssets)
      .where(
        and(
          eq(organizationLogoAssets.organizationId, organizationId),
          isNull(organizationLogoAssets.archivedAt)
        )
      )
      .orderBy(asc(organizationLogoAssets.createdAt), asc(organizationLogoAssets.id));
  }

  async findActiveById(organizationId: number, assetId: number) {
    const [row] = await getControlPlaneDb()
      .select(selection)
      .from(organizationLogoAssets)
      .where(
        and(
          eq(organizationLogoAssets.organizationId, organizationId),
          eq(organizationLogoAssets.id, assetId),
          isNull(organizationLogoAssets.archivedAt)
        )
      )
      .limit(1);

    return row ?? null;
  }

  async findByHash(organizationId: number, contentHash: string) {
    const [row] = await getControlPlaneDb()
      .select(selection)
      .from(organizationLogoAssets)
      .where(
        and(
          eq(organizationLogoAssets.organizationId, organizationId),
          eq(organizationLogoAssets.contentHash, contentHash)
        )
      )
      .limit(1);

    return row ?? null;
  }

  async create(input: {
    organizationId: number;
    contentHash: string;
    filename: string;
    contentType: string;
    byteSize: number;
  }) {
    const [row] = await getControlPlaneDb()
      .insert(organizationLogoAssets)
      .values(input)
      .returning(selection);

    return row;
  }

  async unarchive(organizationId: number, assetId: number) {
    const [row] = await getControlPlaneDb()
      .update(organizationLogoAssets)
      .set({ archivedAt: null })
      .where(
        and(
          eq(organizationLogoAssets.organizationId, organizationId),
          eq(organizationLogoAssets.id, assetId)
        )
      )
      .returning(selection);

    return row ?? null;
  }

  async archive(organizationId: number, assetId: number) {
    const [row] = await getControlPlaneDb()
      .update(organizationLogoAssets)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(organizationLogoAssets.organizationId, organizationId),
          eq(organizationLogoAssets.id, assetId)
        )
      )
      .returning(selection);

    return row ?? null;
  }
}
