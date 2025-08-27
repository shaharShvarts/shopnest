import { PageHeader } from "@/app/admin/_components/PageHeader";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import { CartPageProps } from "../carts/page";

type cartDataProps = {
  cartData: CartPageProps[];
};

export default async function CartTable({ cartData }: cartDataProps) {
  return (
    <div>
      <PageHeader>Shopping Cart</PageHeader>
      {cartData && cartData.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-0">
                <span className="sr-only">Shopping Cart</span>
              </TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cartData.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <span className="sr-only">Inactive</span>
                </TableCell>
                <TableCell>{item.name}</TableCell>
                <TableCell>{item.description}</TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>{item.price}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <p>Your cart is empty.</p>
      )}
    </div>
  );
}
