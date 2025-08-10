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
import {
  deleteSubcategory,
  ToggleSubcategoryActive,
} from "../../_actions/subcategories";
import { SubcategoriesData } from "../page";

type SubcategoryTableProps = {
  subcategoriesData: SubcategoriesData[];
};

export function SubcategoryTable({ subcategoriesData }: SubcategoryTableProps) {
  if (subcategoriesData.length === 0)
    return (
      <p className="text-muted-foreground">
        No subcategories found. Please add a subcategory.
      </p>
    );

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-0">
            <span className="sr-only">Status</span>
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>category</TableHead>
          <TableHead>Products</TableHead>
          <TableHead className="w-0">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {subcategoriesData.map(
          ({ isActive, subcategoryId, name, productsCount, categoryName }) => (
            <TableRow key={subcategoryId}>
              <TableCell>
                <span className="sr-only">
                  {isActive ? "Active" : "Inactive"}
                </span>
                <StatusIcon isActive={isActive} />
              </TableCell>

              <TableCell>{name}</TableCell>
              <TableCell>{categoryName}</TableCell>
              <TableCell>{productsCount}</TableCell>

              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger className="focus:outline-none">
                    <MoreVertical className="cursor-pointer" />
                    <span className="sr-only">Actions</span>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent>
                    <DropdownMenuItem asChild>
                      <Link
                        href={`/admin/subcategories/${subcategoryId}/edit`}
                        className="rounded-sm text-foreground w-full text-left px-2 py-1.5 hover:bg-gray-100 text-sm cursor-pointer outline-none transition-colors"
                      >
                        Edit
                      </Link>
                    </DropdownMenuItem>

                    <ActiveToggleDropdownItem
                      id={subcategoryId}
                      active={isActive}
                      f={ToggleSubcategoryActive}
                    />

                    <DropdownMenuSeparator />

                    <DeleteDropdownItem
                      id={subcategoryId}
                      f={deleteSubcategory}
                      disabled={productsCount > 0}
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
