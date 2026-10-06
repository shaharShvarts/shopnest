import "server-only";

import { requireStoreManagementContext } from "@/lib/store-management/server";
import { DrizzleOrganizationLogoRepository } from "./drizzle-repository";
import { saveOrganizationLogo } from "./local-logo-store.mjs";

const repository = new DrizzleOrganizationLogoRepository();

async function requireOrganizationLogoContext(storeId: number) {
  const context = await requireStoreManagementContext(
    storeId,
    "shipping.manage"
  );

  return {
    store: context.store,
    organizationId: context.store.organizationId,
  };
}

export async function listOrganizationLogosForStore(storeId: number) {
  const { organizationId } = await requireOrganizationLogoContext(storeId);
  return repository.listActive(organizationId);
}

export async function getOrganizationLogoForStore(
  storeId: number,
  assetId: number
) {
  if (!Number.isSafeInteger(assetId) || assetId <= 0) {
    return null;
  }

  const { organizationId } = await requireOrganizationLogoContext(storeId);
  return repository.findActiveById(organizationId, assetId);
}

export async function saveOrganizationLogoForStore(
  storeId: number,
  file: File
) {
  const { organizationId } = await requireOrganizationLogoContext(storeId);

  const stored = await saveOrganizationLogo({
    organizationId,
    file,
  });

  const existing = await repository.findByHash(
    organizationId,
    stored.contentHash
  );

  if (existing) {
    if (existing.archivedAt) {
      return repository.unarchive(organizationId, existing.id);
    }

    return existing;
  }

  return repository.create({
    organizationId,
    contentHash: stored.contentHash,
    filename: stored.filename,
    contentType: stored.contentType,
    byteSize: stored.byteSize,
  });
}

export async function archiveOrganizationLogoForStore(
  storeId: number,
  assetId: number
) {
  if (!Number.isSafeInteger(assetId) || assetId <= 0) {
    return null;
  }

  const { organizationId } = await requireOrganizationLogoContext(storeId);
  return repository.archive(organizationId, assetId);
}

export function organizationLogoPublicUrl(asset: {
  id: number;
  filename: string;
}) {
  if (
    !Number.isSafeInteger(asset.id) ||
    asset.id <= 0 ||
    typeof asset.filename !== "string" ||
    !/^[a-f0-9]{64}\.png$/.test(asset.filename)
  ) {
    throw new Error("invalid_organization_logo_asset");
  }

  return `/organization-logos/${asset.id}/${asset.filename}`;
}
