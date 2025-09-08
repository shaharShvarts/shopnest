import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import Image from "next/image";
import Link from "next/link";
import { CategoryPreview } from "../(customer)/categories/page";
import { useTranslations } from "next-intl";
export function CategoryCard({ id, name, imageUrl }: CategoryPreview) {
  const t = useTranslations("CategoriesPage");

  return (
    <Card className="flex overflow-hidden flex-col">
      <div className="relative w-full aspect-video">
        <Image
          src={imageUrl}
          alt={name}
          fill
          className="object-cover transition-transform duration-300 hover:scale-105"
          sizes="100vw"
        />
      </div>
      <CardHeader className="text-lg font-semibold">
        <CardTitle className="flex justify-center">{name}</CardTitle>
      </CardHeader>
      <CardFooter>
        <Button asChild size="lg" className="w-full">
          <Link href={`/categories/${id}/products`}>{t("button")}</Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export function CategoryCardSkeleton() {
  return (
    <Card className="flex overflow-hidden flex-col animate-pulse">
      <div className="w-full aspect-video bg-gray-300" />
      <CardHeader>
        <CardTitle>
          <div className="w-3/4 h-6 rounded-full bg-gray-300" />
        </CardTitle>
      </CardHeader>
      <CardFooter>
        <Button className="w-full" disabled size="lg"></Button>
      </CardFooter>
    </Card>
  );
}
