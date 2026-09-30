"use client";

import Image from "next/image";
import { ImageOff, Upload } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useTranslations } from "next-intl";
import { isValidImage } from "@/lib/isValidImage";
import { resolveTenantImageUrl } from "@/lib/images/image-url.mjs";

type ManagedImageUploadProps = {
  tenantSlug: string;
  initialImage?: string | null;
};

function tenantResolver(tenantSlug: string) {
  return (value: unknown) =>
    value === tenantSlug
      ? {
          slug: tenantSlug,
          schema: tenantSlug.replaceAll("-", "_"),
          basePath: `/${tenantSlug}`,
        }
      : null;
}

export function ManagedImageUpload({
  tenantSlug,
  initialImage,
}: ManagedImageUploadProps) {
  const t = useTranslations("StoreCatalogManagement");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  const existingImageUrl = useMemo(
    () =>
      resolveTenantImageUrl(
        initialImage,
        tenantSlug,
        tenantResolver(tenantSlug)
      ),
    [initialImage, tenantSlug]
  );

  const previewUrl = objectUrl ?? existingImageUrl;

  useEffect(() => {
    setPreviewFailed(false);
  }, [previewUrl]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  function handleFileSelect(file: File | null) {
    if (!file || !isValidImage(file)) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return false;
    }

    setObjectUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
    return true;
  }

  const { getRootProps, isDragActive } = useDropzone({
    accept: { "image/*": [] },
    multiple: false,
    noClick: true,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0] ?? null;
      if (!handleFileSelect(file) || !fileInputRef.current || !file) return;

      const transfer = new DataTransfer();
      transfer.items.add(file);
      fileInputRef.current.files = transfer.files;
    },
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={
          "relative flex min-h-[360px] w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed p-4 transition-colors " +
          (isDragActive
            ? "border-foreground bg-muted"
            : "border-border bg-muted/20")
        }
      >
        <input
          ref={fileInputRef}
          type="file"
          name="image"
          accept="image/*"
          aria-label={t("image")}
          required={!existingImageUrl}
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
          onChange={(event) => {
            handleFileSelect(event.target.files?.[0] ?? null);
          }}
        />

        {previewUrl && !previewFailed ? (
          <Image
            src={previewUrl}
            alt={t("image")}
            width={900}
            height={700}
            unoptimized
            onError={() => setPreviewFailed(true)}
            className="max-h-[420px] w-full rounded-xl object-contain"
          />
        ) : (
          <div className="pointer-events-none flex flex-col items-center gap-3 text-center text-muted-foreground">
            {previewFailed ? <ImageOff className="size-9" /> : <Upload className="size-9" />}
            <p className="font-semibold">
              {previewFailed ? t("storedImageUnavailable") : t("chooseOrDropImage")}
            </p>
            <p className="text-sm">{t("imageHelp")}</p>
          </div>
        )}
      </div>

      {existingImageUrl ? (
        <p className="text-sm text-muted-foreground">
          {t("imageReplacementHelp")}
        </p>
      ) : null}
    </div>
  );
}
