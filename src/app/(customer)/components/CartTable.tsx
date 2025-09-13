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
        <TableHeader>
          <TableRow className={locale === "he" ? "[&>th]:text-right" : ""}>
            <TableHead className="w-0">
              <span className="sr-only">Shopping Cart</span>
            </TableHead>
            <TableHead>{t("th_name")}</TableHead>
            <TableHead>{t("th_description")}</TableHead>
            <TableHead>{t("th_quantity")}</TableHead>
            <TableHead>{t("th_price")}</TableHead>
            <TableHead>{t("th_remove")}</TableHead>
            <TableHead className="w-0">
              <span className="sr-only">Remove</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cartData.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <span className="sr-only">Shopping Cart</span>
              </TableCell>
              <TableCell>{item.name}</TableCell>
              <TableCell>{item.description}</TableCell>
              <TableCell>{item.quantity}</TableCell>
              <TableCell>{item.price}</TableCell>
              <RemoveButton productId={item.id} />
            </TableRow>
          ))}
          <TableRow className="font-semibold border-t">
            <TableCell />
            <TableCell colSpan={2}>{t("summary_label")}</TableCell>
            <TableCell>{totalQuantity}</TableCell>
            <TableCell>{totalPrice.toFixed(2)}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <Button className="p-4 mt-4">
        <Link href="/shipping" className="text-white">
          {t("button")}
        </Link>
      </Button>
    </>
  );
}
