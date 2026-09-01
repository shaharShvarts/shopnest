"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { TenantLink } from "@/components/TenantLink";
import { useTenant } from "@/context/TenantContext";
import { resolveTenantImageUrl } from "@/lib/images/image-url.mjs";

type SubcategoryCardProps = {
  id: number;
  categoryId: number;
  name: string;
  imageUrl: string;
};

export function SubcategoryCard({
  id,
  categoryId,
  name,
  imageUrl,
}: SubcategoryCardProps) {
  const tenant = useTenant();
  const t = useTranslations("CatalogUX");
  const normalizedImageUrl = resolveTenantImageUrl(imageUrl, tenant.slug);

  return (
    <TenantLink
      href={`/categories/${categoryId}/subcategories/${id}`}
      className="group relative block min-w-0 overflow-hidden rounded-2xl bg-muted shadow-sm outline-none ring-offset-2 transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden">
        {normalizedImageUrl ? (
          <Image
            src={normalizedImageUrl}
            alt={name}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 50vw"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted text-muted-foreground">
            <ImageIcon aria-hidden="true" className="size-8" />
            <span className="text-sm">{t("imageUnavailable")}</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-4 pb-4 pt-12 text-white">
          <h3 className="break-words text-lg font-semibold leading-tight sm:text-xl">
            {name}
          </h3>
        </div>
      </div>
    </TenantLink>
  );
}
