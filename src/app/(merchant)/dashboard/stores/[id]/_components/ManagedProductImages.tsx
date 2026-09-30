"use client";

import { ImageOff, Plus, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { isValidImage } from "@/lib/isValidImage";
import { resolveTenantImageUrl } from "@/lib/images/image-url.mjs";

type ExistingImage = {
  id: number;
  imageUrl: string;
  sortOrder: number;
};

type PreviewFile = {
  file: File;
  url: string;
};

type TenantImageIdentity = {
  slug: string;
  schema: string;
  basePath: string;
};

type TenantImageResolver = (value: unknown) => TenantImageIdentity | null;

const resolveTenantImageUrlWithResolver =
  resolveTenantImageUrl as unknown as (
    value: unknown,
    tenantSlug: string,
    resolveTenant: TenantImageResolver
  ) => string | null;

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

export function ManagedProductImages({
  tenantSlug,
  existingImages,
}: {
  tenantSlug: string;
  existingImages: ExistingImage[];
}) {
  const t = useTranslations("StoreCatalogManagement");
  const inputRef = useRef<HTMLInputElement>(null);
  const [newImages, setNewImages] = useState<PreviewFile[]>([]);

  const normalizedExisting = useMemo(
    () =>
      existingImages.map((image) => ({
        ...image,
        src: resolveTenantImageUrlWithResolver(
          image.imageUrl,
          tenantSlug,
          tenantResolver(tenantSlug)
        ),
      })),
    [existingImages, tenantSlug]
  );


  function syncFiles(next: PreviewFile[]) {
    setNewImages(next);
    if (!inputRef.current) return;
    const transfer = new DataTransfer();
    for (const image of next) transfer.items.add(image.file);
    inputRef.current.files = transfer.files;
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-muted/10 p-4 sm:p-6">
      <div>
        <h2 className="text-lg font-semibold">{t("productImages")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("productImagesHelp")}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {normalizedExisting.map((image, index) => (
          <div
            key={image.id}
            className="relative overflow-hidden rounded-xl border border-border bg-background p-2"
          >
            {image.src ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={image.src}
                alt={t("productImageNumber", { number: index + 1 })}
                className="aspect-square w-full rounded-lg object-contain"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center text-muted-foreground">
                <ImageOff className="size-8" />
              </div>
            )}
            {index === 0 ? (
              <span className="absolute start-4 top-4 rounded-full bg-background/90 px-2 py-1 text-xs font-semibold shadow">
                {t("primaryImage")}
              </span>
            ) : null}
          </div>
        ))}

        {newImages.map((image, index) => (
          <div
            key={image.url}
            className="relative overflow-hidden rounded-xl border border-border bg-background p-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={image.url}
              alt={t("newProductImageNumber", { number: index + 1 })}
              className="aspect-square w-full rounded-lg object-contain"
            />
            <button
              type="button"
              aria-label={t("removeImage")}
              className="absolute end-3 top-3 inline-flex size-8 items-center justify-center rounded-full bg-background/90 shadow"
              onClick={() => {
                const next = newImages.filter((_, itemIndex) => itemIndex !== index);
                URL.revokeObjectURL(image.url);
                syncFiles(next);
              }}
            >
              <X className="size-4" />
            </button>
          </div>
        ))}

        <label className="flex aspect-square min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-background p-4 text-center transition-colors hover:bg-muted/40">
          <Plus className="size-8" />
          <span className="font-semibold">{t("addImages")}</span>
          <span className="text-sm text-muted-foreground">{t("imageHelp")}</span>
          <input
            ref={inputRef}
            type="file"
            name="images"
            accept="image/*"
            multiple
            required={existingImages.length === 0 && newImages.length === 0}
            className="sr-only"
            onChange={(event) => {
              const selected = Array.from(event.target.files ?? []).filter(isValidImage);
              const additions = selected.map((file) => ({
                file,
                url: URL.createObjectURL(file),
              }));
              syncFiles([...newImages, ...additions]);
            }}
          />
        </label>
      </div>
    </section>
  );
}
