import path from "node:path";
import { normalizeImageUrl } from "./image-url.mjs";

export function publicImageFilePath(imageUrl: unknown) {
  const normalized = normalizeImageUrl(imageUrl);
  if (!normalized?.startsWith("/") || normalized.startsWith("//")) return null;

  const pathname = normalized.split(/[?#]/, 1)[0];
  const publicRoot = path.resolve(process.cwd(), "public");
  const filePath = path.resolve(publicRoot, `.${pathname}`);
  const relative = path.relative(publicRoot, filePath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return filePath;
}
