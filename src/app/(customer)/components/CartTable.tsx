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
import Link from "next/link";
import { cn } from "@/lib/utils";

type cartDataProps = {
  cartData: CartPageProps[];
};

export default async function CartTable({ cartData }: cartDataProps) {
  const locale = await getLocale();
  const t = await getTranslations("CartPage");
  const totalQuantity = cartData.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = cartData.reduce((sum, item) => sum + item.price, 0);

  if (cartData.length === 0)
    return (
      <>
        <p className="text-muted-foreground">{t("alter")}</p>
        <Button className="p-4 mt-4">
          <Link href="/" className="text-white">
            {t("shop_button")}
          </Link>
        </Button>
      </>
    );

  return (
    <>
      <Table>
        <TableHeader className="bg-muted">
          <TableRow className={cn(locale === "he" ? "[&>th]:text-right" : "")}>
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
                <div className="flex items-center gap-3">
                  <RemoveButton productId={item.id} />
                  <span>{item.name}</span>
                </div>
              </TableCell>
              <TableCell>{item.description}</TableCell>
              <TableCell>{item.quantity}</TableCell>
              <TableCell>{item.price}</TableCell>
            </TableRow>
          ))}
          <TableRow className="font-semibold border-t bg-muted">
            <TableCell colSpan={2}>{t("summary_label")}</TableCell>
            <TableCell>{totalQuantity}</TableCell>
            <TableCell>
              {new Intl.NumberFormat("he-IL", {
                style: "currency",
                currency: "ILS",
              }).format(totalPrice)}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <div className="flex justify-center mt-4">
        <Button className="p-4">
          <Link href="/shipping" className="text-white">
            {t("button")}
          </Link>
        </Button>
      </div>
    </>
  );
}
