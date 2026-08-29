"use client";

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";
import { normalizeImageUrl } from "@/lib/images/image-url.mjs";

type AdminImagePreviewProps = {
  src?: string | null;
  alt: string;
  compact?: boolean;
};

export function AdminImagePreview({
  src,
  alt,
  compact = false,
}: AdminImagePreviewProps) {
  const normalizedSrc = normalizeImageUrl(src);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [normalizedSrc]);

  if (!normalizedSrc || failed) {
    return (
      <div
        className={
          compact
            ? "flex size-12 items-center justify-center rounded border bg-muted text-muted-foreground"
            : "flex h-full w-full flex-col items-center justify-center gap-2 text-center text-muted-foreground"
        }
      >
        <ImageOff className={compact ? "size-5" : "size-8"} />
        {!compact && (
          <span className="text-sm">
            Stored image unavailable. Choose a replacement image.
          </span>
        )}
      </div>
    );
  }

  return (
    <Image
      src={normalizedSrc}
      alt={alt}
      width={compact ? 48 : 800}
      height={compact ? 48 : 600}
      unoptimized
      onError={() => setFailed(true)}
      className={
        compact
          ? "size-12 rounded object-cover"
          : "h-full w-full rounded object-contain"
      }
    />
  );
}
