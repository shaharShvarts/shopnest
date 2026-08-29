import { TenantLink as Link } from "@/components/TenantLink";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";

type CategoryCardProps = {
  [key: string]: string | number;
};

export function CategoryCard(props: CategoryCardProps) {
  const { id, name, imageUrl } = props;

  const t = useTranslations("CategoriesPage");

  return (
    <Card className="flex min-w-0 overflow-hidden flex-col">
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        <Image
          src={String(imageUrl)}
          alt={String(name)}
          fill
          className="object-cover transition-transform duration-300 hover:scale-105"
          sizes="(min-width: 1280px) 25vw, (min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        />
      </div>
      <CardHeader className="p-4 text-lg font-semibold">
        <CardTitle className="flex min-w-0 justify-center break-words text-center text-base sm:text-lg">
          {name}
        </CardTitle>
      </CardHeader>
      <CardFooter className="mt-auto p-4 pt-0">
        <Button asChild size="lg" className="min-h-11 w-full">
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
