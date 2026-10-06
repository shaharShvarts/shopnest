import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getUploadsRoot } from "../media/local-media-store.mjs";
import { validateCatalogImage } from "../media/validate-image.mjs";

export class OrganizationLogoStorageError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "OrganizationLogoStorageError";
    this.code = code;
  }
}

function assertOrganizationId(organizationId) {
  if (!Number.isSafeInteger(organizationId) || organizationId <= 0) {
    throw new OrganizationLogoStorageError(
      "INVALID_ORGANIZATION",
      "Invalid Organization"
    );
  }
}

export function organizationLogoFilePath({
  organizationId,
  contentHash,
  uploadsRoot,
}) {
  assertOrganizationId(organizationId);

  if (
    typeof contentHash !== "string" ||
    !/^[a-f0-9]{64}$/.test(contentHash)
  ) {
    throw new OrganizationLogoStorageError(
      "INVALID_HASH",
      "Invalid logo content hash"
    );
  }

  const root = getUploadsRoot(uploadsRoot);
  const filePath = path.resolve(
    root,
    "organizations",
    String(organizationId),
    "logos",
    `${contentHash}.png`
  );

  const relative = path.relative(root, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new OrganizationLogoStorageError(
      "INVALID_PATH",
      "Logo path escapes upload root"
    );
  }

  return filePath;
}

export async function saveOrganizationLogo({
  organizationId,
  file,
  uploadsRoot,
}) {
  assertOrganizationId(organizationId);

  const bytes = await validateCatalogImage(file);
  const contentHash = crypto
    .createHash("sha256")
    .update(bytes)
    .digest("hex");

  const filename = `${contentHash}.png`;
  const filePath = organizationLogoFilePath({
    organizationId,
    contentHash,
    uploadsRoot,
  });

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  try {
    await fs.writeFile(filePath, bytes, { flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }

  return {
    contentHash,
    filename,
    filePath,
    contentType: "image/png",
    byteSize: bytes.length,
  };
}

export async function readOrganizationLogo({
  organizationId,
  contentHash,
  uploadsRoot,
}) {
  const filePath = organizationLogoFilePath({
    organizationId,
    contentHash,
    uploadsRoot,
  });

  try {
    return {
      bytes: await fs.readFile(filePath),
      contentType: "image/png",
      filePath,
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new OrganizationLogoStorageError(
        "NOT_FOUND",
        "Organization logo not found"
      );
    }
    throw error;
  }
}
