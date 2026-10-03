"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { TenantLink } from "@/components/TenantLink";
import { useTenant } from "@/context/TenantContext";
import { resolveTenantImageUrl } from "@/lib/images/image-url.mjs";

type CategoryCardProps = {
  id: number;
  name: string;
  imageUrl: string;
};

export function CategoryCard({ id, name, imageUrl }: CategoryCardProps) {
  const tenant = useTenant();
  const t = useTranslations("CatalogUX");
  const normalizedImageUrl = resolveTenantImageUrl(
    imageUrl,
    tenant.slug,
    (value: unknown) =>
      value === tenant.slug
        ? {
            slug: tenant.slug,
            schema: "",
            basePath: tenant.basePath || `/${tenant.slug}`,
          }
        : null
  );

  return (
    <TenantLink
      href={`/categories/${id}/products`}
      className="group relative block min-w-0 overflow-hidden rounded-2xl bg-muted shadow-sm outline-none ring-offset-2 transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="relative aspect-[5/4] w-full overflow-hidden">
        {normalizedImageUrl ? (
          <Image
            src={normalizedImageUrl}
            alt={name}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, (min-width: 430px) 50vw, 100vw"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 bg-muted text-muted-foreground">
            <ImageIcon aria-hidden="true" className="size-9" />
            <span className="text-sm">{t("imageUnavailable")}</span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent px-5 pb-5 pt-16 text-white">
          <h2 className="break-words text-xl font-semibold leading-tight sm:text-2xl">
            {name}
          </h2>
        </div>
      </div>
    </TenantLink>
  );
}

export function CategoryCardSkeleton() {
  return (
    <div className="min-w-0 animate-pulse overflow-hidden rounded-2xl bg-muted shadow-sm">
      <div className="aspect-[5/4] w-full bg-gray-200" />
    </div>
  );
}
