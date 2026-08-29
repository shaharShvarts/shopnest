import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import Image from "next/image";
import { formatCurrency } from "@/lib/formatters";
import { ProductPreview } from "../(customer)/types";
import { getTranslations } from "next-intl/server";
import { TenantLink as Link } from "@/components/TenantLink";
import { resolveTenantImageUrl } from "@/lib/images/image-url.mjs";

type ProductCardProps = ProductPreview & { tenantSlug?: string };

export async function ProductCard({
  id,
  name,
  price,
  imageUrl,
  description,
  quantity,
  inventoryStatus,
  tenantSlug = "",
}: ProductCardProps) {
  const t = await getTranslations("ProductsPage");
  const normalizedImageUrl = resolveTenantImageUrl(imageUrl, tenantSlug);
  return (
    <Card className="flex min-w-0 overflow-hidden flex-col">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {normalizedImageUrl ? (
          <Image
            src={normalizedImageUrl}
            alt={name}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 hover:scale-105"
            sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-muted text-muted-foreground">
            Image unavailable
          </div>
        )}
      </div>
      <CardHeader className="min-w-0 p-4 text-lg font-semibold">
        <CardTitle className="break-words text-base sm:text-lg">{name}</CardTitle>
        <CardDescription>{formatCurrency(price)}</CardDescription>
        {(quantity <= 0 || inventoryStatus === "out_of_stock") && (
          <p className="text-sm font-semibold text-destructive">Out of stock</p>
        )}
      </CardHeader>
      <CardContent className="min-w-0 flex-grow px-4 pb-4">
        <p className="line-clamp-4 break-words text-sm sm:text-base">
          {description}
        </p>
      </CardContent>
      <CardFooter className="p-4 pt-0">
        {quantity <= 0 || inventoryStatus === "out_of_stock" ? (
          <Button size="lg" className="min-h-11 w-full" disabled>
            Out of stock
          </Button>
        ) : (
          <Button asChild size="lg" className="min-h-11 w-full">
            <Link href={`/products/${id}/details`}>{t("button")}</Link>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}

export async function ProductCardSkeleton() {
  return (
    <Card className="flex min-w-0 animate-pulse flex-col overflow-hidden">
      <div className="aspect-[4/3] w-full bg-gray-300" />
      <CardHeader className="p-4">
        <CardTitle>
          <div className="w-3/4 h-6 rounded-full bg-gray-300" />
        </CardTitle>
        <CardDescription>
          <div className="w-1/2 h-4 rounded-full bg-gray-300" />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 px-4 pb-4">
        <div className="w-full h-4 rounded-full bg-gray-300" />
        <div className="w-full h-4 rounded-full bg-gray-300" />
        <div className="w-full h-4 rounded-full bg-gray-300" />
      </CardContent>
      <CardFooter className="p-4 pt-0">
        <Button className="min-h-11 w-full" disabled size="lg"></Button>
      </CardFooter>
    </Card>
  );
}
