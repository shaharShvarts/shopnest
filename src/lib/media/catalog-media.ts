import "server-only";

// Catalog code imports this boundary so local disk can later be replaced with
// Vercel Blob or S3 without changing catalog database operations.
import {
  deleteCatalogImage as deleteCatalogImageLocal,
  LocalMediaError,
  readCatalogImage as readCatalogImageLocal,
  saveCatalogImage as saveCatalogImageLocal,
} from "./local-media-store.mjs";

type CatalogMediaTenant = {
  slug: string;
  basePath: string;
};

export type CatalogMediaTenantResolver = (
  value: unknown
) => CatalogMediaTenant | null;

type WithTenantResolver<T> = T & {
  resolveTenant?: CatalogMediaTenantResolver;
};

type SaveCatalogImageArgs = WithTenantResolver<
  Parameters<typeof saveCatalogImageLocal>[0]
>;

type DeleteCatalogImageArgs = WithTenantResolver<
  Parameters<typeof deleteCatalogImageLocal>[0]
>;

type ReadCatalogImageArgs = WithTenantResolver<
  Parameters<typeof readCatalogImageLocal>[0]
>;

const saveCatalogImageWithResolver = saveCatalogImageLocal as unknown as (
  args: SaveCatalogImageArgs
) => ReturnType<typeof saveCatalogImageLocal>;

const deleteCatalogImageWithResolver =
  deleteCatalogImageLocal as unknown as (
    args: DeleteCatalogImageArgs
  ) => ReturnType<typeof deleteCatalogImageLocal>;

const readCatalogImageWithResolver = readCatalogImageLocal as unknown as (
  args: ReadCatalogImageArgs
) => ReturnType<typeof readCatalogImageLocal>;

export function saveCatalogImage(args: SaveCatalogImageArgs) {
  return saveCatalogImageWithResolver(args);
}

export function deleteCatalogImage(args: DeleteCatalogImageArgs) {
  return deleteCatalogImageWithResolver(args);
}

export function readCatalogImage(args: ReadCatalogImageArgs) {
  return readCatalogImageWithResolver(args);
}

export { LocalMediaError };
