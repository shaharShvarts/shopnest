import { unstable_cache as nextCache } from "next/cache";
import { cache as reactCache } from "react";

export function cache<Args extends unknown[], Result>(
  cb: (...args: Args) => Promise<Result>,
  keyParts: string[],
  options: { revalidate?: number | false; tags?: string[] } = {}
) {
  return nextCache(reactCache(cb), keyParts, options);
}
