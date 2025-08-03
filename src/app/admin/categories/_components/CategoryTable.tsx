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
import { count, eq } from "drizzle-orm";

import { db } from "@/drizzle/db";
import { categories, products, subcategories } from "@/drizzle/schema";
import {
  ActiveToggleDropdownItem,
  DeleteDropdownItem,
} from "./categoryActions";
import { StatusIcon } from "@/app/components/StatusIcon";

type CategoriesData = {
  isActive: boolean;
  categoryId: number;
  name: string;
  productsCount: number;
  subcategoriesCount: number;
};

export async function CategoryTable() {
  const categoriesData: CategoriesData[] = await db
    .select({
      isActive: categories.isActive,
      categoryId: categories.id,
      name: categories.name,
      productsCount: count(products.id).as("productsCount"),
      subcategoriesCount: count(subcategories.id).as("subcategoriesCount"),
    })
    .from(categories)
    .leftJoin(products, eq(categories.id, products.categoryId))
    .leftJoin(subcategories, eq(categories.id, subcategories.categoryId))
    .groupBy(categories.id, categories.name, categories.isActive)
    .orderBy(categories.name);

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
                    />

                    <DropdownMenuSeparator />

                    <DeleteDropdownItem
                      id={categoryId}
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
