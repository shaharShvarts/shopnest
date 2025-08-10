import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui";
import { MoreVertical } from "lucide-react";
import Link from "next/link";

import { StatusIcon } from "@/app/components/StatusIcon";
import {
  ActiveToggleDropdownItem,
  DeleteDropdownItem,
} from "../../_components/PageActions";
import { ProductData } from "../page";
import { deleteProduct, ToggleProductActive } from "../../_actions/products";

type ProductTableProps = {
  productData: ProductData[];
};

export function ProductTable({ productData }: ProductTableProps) {
  if (productData.length === 0)
    return (
      <p className="text-muted-foreground">
        No products found. Please add a product.
      </p>
    );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-0">
            <span className="sr-only">Available for Purchase</span>
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Price</TableHead>
          <TableHead>Orders</TableHead>
          <TableHead className="w-0">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {productData.map(
          ({ productsId, name, price, ordersCount, isActive }) => (
            <TableRow key={productsId}>
              <TableCell>
                <span className="sr-only">
                  {isActive ? "Active" : "Inactive"}
                </span>
                <StatusIcon isActive={isActive} />
              </TableCell>
              <TableCell>{name}</TableCell>
              <TableCell>{price}</TableCell>
              <TableCell>{ordersCount}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger className="focus:outline-none">
                    <MoreVertical className="cursor-pointer" />
                    <span className="sr-only">Actions</span>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent>
                    <DropdownMenuItem asChild>
                      <Link
                        href={`/admin/products/${productsId}/edit`}
                        className="text-foreground w-full text-left px-2 py-1.5 hover:bg-gray-100 text-sm cursor-pointer outline-none transition-colors"
                      >
                        Edit
                      </Link>
                    </DropdownMenuItem>

                    <ActiveToggleDropdownItem
                      id={productsId}
                      active={isActive}
                      f={ToggleProductActive}
                    />

                    <DropdownMenuSeparator />

                    <DeleteDropdownItem
                      id={productsId}
                      f={deleteProduct}
                      disabled={ordersCount > 0}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          )
        )}
      </TableBody>
    </Table>
  );
}
