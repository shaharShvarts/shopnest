import type { CatalogMediaKind } from "../images/image-url.mjs";

export class LocalMediaError extends Error {
  readonly code: string;
}

type MediaFile = {
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
};

type MediaLocation = {
  tenantSlug: string;
  kind: CatalogMediaKind;
  filename: string;
  uploadsRoot?: string;
};

export function getUploadsRoot(override?: string): string;
export function tenantMediaFilePath(location: MediaLocation): string;
export function saveCatalogImage(input: {
  tenantSlug: string;
  kind: CatalogMediaKind;
  file: MediaFile;
  uploadsRoot?: string;
}): Promise<{ filename: string; filePath: string; imageUrl: string }>;
export function readCatalogImage(
  location: MediaLocation
): Promise<{ bytes: Buffer; contentType: string; filePath: string }>;
export function deleteCatalogImage(input: {
  tenantSlug: string;
  imageUrl: unknown;
  uploadsRoot?: string;
}): Promise<boolean>;
