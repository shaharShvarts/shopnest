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
  deleteCategory,
  ToggleCategoryActive,
} from "../../_actions/categories";

type CategoriesData = {
  isActive: boolean;
  categoryId: number;
  name: string;
  productsCount: number;
  subcategoriesCount: number;
};

type CategoryTableProps = {
  categoriesData: CategoriesData[];
};

export function CategoryTable({ categoriesData }: CategoryTableProps) {
  if (categoriesData.length === 0)
    return (
      <p className="text-muted-foreground">
        No categories found. Please add a category.
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
          <TableHead>Subcategories</TableHead>
          <TableHead>Products</TableHead>
          <TableHead className="w-0">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>

      <TableBody>
        {categoriesData.map(
          ({
            isActive,
            categoryId,
            name,
            productsCount,
            subcategoriesCount,
          }) => (
            <TableRow key={categoryId}>
              <TableCell>
                <span className="sr-only">
                  {isActive ? "Active" : "Inactive"}
                </span>
                <StatusIcon isActive={isActive} />
              </TableCell>

              <TableCell>{name}</TableCell>
              <TableCell>{subcategoriesCount}</TableCell>
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
                        href={`/admin/categories/${categoryId}/edit`}
                        className="text-foreground w-full text-left px-2 py-1.5 hover:bg-gray-100 text-sm cursor-pointer outline-none transition-colors"
                      >
                        Edit
                      </Link>
                    </DropdownMenuItem>

                    <ActiveToggleDropdownItem
                      id={categoryId}
                      active={isActive}
                      f={ToggleCategoryActive}
                    />

                    <DropdownMenuSeparator />

                    <DeleteDropdownItem
                      id={categoryId}
                      f={deleteCategory}
                      disabled={subcategoriesCount > 0 || productsCount > 0}
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
