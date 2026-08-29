import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { CartPageProps } from "../carts/page";
import { getTranslations } from "next-intl/server";
import { getLocale } from "next-intl/server";
import { RemoveButton } from "../carts/_components/RemoveButton";
import { Button } from "@/components/ui/button";
import { TenantLink as Link } from "@/components/TenantLink";
import { cn } from "@/lib/utils";
import Image from "next/image";

type cartDataProps = {
  cartData: CartPageProps[];
};

export default async function CartTable({ cartData }: cartDataProps) {
  const locale = await getLocale();
  const t = await getTranslations("CartPage");
  const totalQuantity = cartData.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cartData.reduce((sum, item) => sum + item.price, 0);
  const formatPrice = (price: number) =>
    new Intl.NumberFormat("he-IL", {
      style: "currency",
      currency: "ILS",
    }).format(price);

  if (cartData.length === 0)
    return (
      <>
        <p className="text-muted-foreground">{t("alter")}</p>
        <Button asChild className="mt-4 min-h-11">
          <Link href="/" className="text-white">
            {t("shop_button")}
          </Link>
        </Button>
      </>
    );

  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader className="bg-muted">
            <TableRow
              className={cn(locale === "he" ? "[&>th]:text-right" : "")}
            >
              <TableHead className="font-bold">{t("th_name")}</TableHead>
              <TableHead className="font-bold">{t("th_description")}</TableHead>
              <TableHead className="font-bold">{t("th_quantity")}</TableHead>
              <TableHead className="font-bold">{t("th_price")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cartData.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="flex min-w-0 items-center gap-3">
                    <RemoveButton productId={item.id} />
                    <div className="relative size-14 shrink-0 overflow-hidden rounded bg-muted">
                      <Image
                        src={item.imageUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="56px"
                      />
                    </div>
                    <span className="break-words whitespace-normal">
                      {item.name}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="max-w-md whitespace-normal">
                  {item.description}
                </TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{formatPrice(item.price)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 md:hidden">
        {cartData.map((item) => (
          <article
            key={item.id}
            className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-3 rounded-lg border p-3"
          >
            <div className="relative aspect-square w-20 overflow-hidden rounded-md bg-muted">
              <Image
                src={item.imageUrl}
                alt={item.name}
                fill
                className="object-cover"
                sizes="80px"
              />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <h2 className="min-w-0 break-words font-semibold">
                  {item.name}
                </h2>
                <RemoveButton productId={item.id} />
              </div>
              {item.description && (
                <p className="line-clamp-2 break-words text-sm text-muted-foreground">
                  {item.description}
                </p>
              )}
              <dl className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-muted-foreground">{t("th_quantity")}</dt>
                  <dd className="font-medium">{item.quantity}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("th_price")}</dt>
                  <dd className="font-medium">{formatPrice(item.price)}</dd>
                </div>
              </dl>
            </div>
          </article>
        ))}
      </div>

      <section className="mt-4 flex flex-col gap-3 rounded-lg bg-muted p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">{t("summary_label")}</p>
          <p className="text-sm text-muted-foreground">
            {t("th_quantity")}: {totalQuantity}
          </p>
        </div>
        <p className="text-lg font-semibold">{formatPrice(totalPrice)}</p>
      </section>

      <div className="mt-4 flex justify-stretch sm:justify-center">
        <Button asChild className="min-h-11 w-full sm:w-auto sm:min-w-48">
          <Link href="/checkout" className="text-white">
            {t("button")}
          </Link>
        </Button>
      </div>
    </>
  );
}
