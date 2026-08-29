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
import { normalizeImageUrl } from "@/lib/images/image-url.mjs";

export async function ProductCard({
  id,
  name,
  price,
  imageUrl,
  description,
}: ProductPreview) {
  const t = await getTranslations("ProductsPage");
  const normalizedImageUrl = normalizeImageUrl(imageUrl);
  return (
    <Card className="flex overflow-hidden flex-col">
      <div className="relative w-full aspect-video">
        {normalizedImageUrl ? (
          <Image
            src={normalizedImageUrl}
            alt={name}
            fill
            unoptimized
            className="object-cover transition-transform duration-300 hover:scale-105"
            sizes="100vw"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-muted text-muted-foreground">
            Image unavailable
          </div>
        )}
      </div>
      <CardHeader className="text-lg font-semibold">
        <CardTitle>{name}</CardTitle>
        <CardDescription>{formatCurrency(price)}</CardDescription>
      </CardHeader>
      <CardContent className="flex-grow">
        <p className="line-clamp-4">{description}</p>
      </CardContent>
      <CardFooter>
        <Button asChild size="lg" className="w-full">
          <Link href={`/products/${id}/details`}>{t("button")}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export async function ProductCardSkeleton() {
  return (
    <Card className="flex overflow-hidden flex-col animate-pulse">
      <div className="w-full aspect-video bg-gray-300" />
      <CardHeader>
        <CardTitle>
          <div className="w-3/4 h-6 rounded-full bg-gray-300" />
        </CardTitle>
        <CardDescription>
          <div className="w-1/2 h-4 rounded-full bg-gray-300" />
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="w-full h-4 rounded-full bg-gray-300" />
        <div className="w-full h-4 rounded-full bg-gray-300" />
        <div className="w-full h-4 rounded-full bg-gray-300" />
      </CardContent>
      <CardFooter>
        <Button className="w-full" disabled size="lg"></Button>
      </CardFooter>
    </Card>
  );
}
