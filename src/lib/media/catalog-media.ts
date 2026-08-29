import "server-only";

// Catalog code imports this boundary so local disk can later be replaced with
// Vercel Blob or S3 without changing catalog database operations.
export {
  deleteCatalogImage,
  LocalMediaError,
  readCatalogImage,
  saveCatalogImage,
} from "./local-media-store.mjs";
