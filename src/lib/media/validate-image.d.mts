export class ImageValidationError extends Error {
  readonly code: string;
}
export function validateCatalogImage(file: { size: number; arrayBuffer(): Promise<ArrayBuffer> }): Promise<Buffer>;
