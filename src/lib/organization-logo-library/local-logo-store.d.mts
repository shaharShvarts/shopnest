export class OrganizationLogoStorageError extends Error {
  readonly code: string;
}

type LogoFile = {
  type: string;
  size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type StoredOrganizationLogo = {
  contentHash: string;
  filename: string;
  filePath: string;
  contentType: "image/png";
  byteSize: number;
};

export function saveOrganizationLogo(input: {
  organizationId: number;
  file: LogoFile;
  uploadsRoot?: string;
}): Promise<StoredOrganizationLogo>;

export function readOrganizationLogo(input: {
  organizationId: number;
  contentHash: string;
  uploadsRoot?: string;
}): Promise<{
  bytes: Buffer;
  contentType: "image/png";
  filePath: string;
}>;
