import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { TenantLink } from "@/components/TenantLink";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import { resolveTenantImageUrl } from "@/lib/images/image-url.mjs";
import { getCustomerStockMessage } from "@/lib/inventory/core";
import type { ProductPreview } from "../(customer)/types";
import { AddToCartButton } from "./AddToCartButton";

type ProductCardProps = ProductPreview & { tenantSlug?: string };

export async function ProductCard({
  id,
  name,
  price,
  imageUrl,
  quantity,
  inventoryStatus,
  tenantSlug = "",
}: ProductCardProps) {
  const t = await getTranslations("ProductsPage");
  const normalizedImageUrl = resolveTenantImageUrl(imageUrl, tenantSlug);
  const stockMessage = getCustomerStockMessage(quantity);
  const stockText =
    stockMessage.kind === "out_of_stock"
      ? t("stockOut")
      : stockMessage.kind === "last_one"
        ? t("stockLast")
        : stockMessage.kind === "exact"
          ? t("stockExact", { count: stockMessage.quantity })
          : stockMessage.kind === "few_left"
            ? t("stockFew")
            : null;
  const outOfStock =
    quantity <= 0 || inventoryStatus === "out_of_stock";

  return (
    <Card className="group relative min-w-0 gap-0 overflow-hidden rounded-2xl border-0 py-0 shadow-sm ring-1 ring-black/5 transition duration-200 hover:-translate-y-0.5 hover:shadow-md focus-within:ring-2 focus-within:ring-primary">
      <TenantLink
        href={`/products/${id}/details`}
        aria-label={t("viewProduct", { name })}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none"
      >
        <span className="sr-only">{t("viewProduct", { name })}</span>
      </TenantLink>

      <div className="pointer-events-none relative aspect-square w-full overflow-hidden bg-muted">
        {normalizedImageUrl ? (
          <Image
            src={normalizedImageUrl}
            alt={name}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 430px) 50vw, 100vw"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <ImageIcon aria-hidden="true" className="size-8" />
            <span className="text-sm">{t("imageUnavailable")}</span>
          </div>
        )}
      </div>

      <CardContent className="pointer-events-none relative z-0 flex min-h-32 flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 break-words text-base font-semibold leading-snug sm:text-lg">
          {name}
        </h3>
        <p className="text-lg font-bold tracking-tight sm:text-xl">
          {formatCurrency(price)}
        </p>
        <div className="mt-auto min-h-5">
          {stockText && (
            <p
              className={`text-sm font-medium ${
                outOfStock ? "text-destructive" : "text-amber-700"
              }`}
              role="status"
            >
              {stockText}
            </p>
          )}
        </div>
      </CardContent>

      <CardFooter className="relative z-10 p-4 pt-0">
        <AddToCartButton productId={id} disabled={outOfStock} />
      </CardFooter>
    </Card>
  );
}

export async function ProductCardSkeleton() {
  return (
    <Card className="min-w-0 animate-pulse gap-0 overflow-hidden rounded-2xl border-0 py-0 shadow-sm ring-1 ring-black/5">
      <div className="aspect-square w-full bg-gray-200" />
      <CardContent className="space-y-3 p-4">
        <div className="h-5 w-3/4 rounded-full bg-gray-200" />
        <div className="h-6 w-1/2 rounded-full bg-gray-200" />
        <div className="h-4 w-2/3 rounded-full bg-gray-200" />
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <div className="h-11 w-full rounded-xl bg-gray-200" />
      </CardFooter>
    </Card>
  );
}
