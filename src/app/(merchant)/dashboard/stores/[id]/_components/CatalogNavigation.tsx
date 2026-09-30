"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function CatalogNavigation({ storeId }: { storeId: number }) {
  const pathname = usePathname();
  const items = [
    {
      href: `/dashboard/stores/${storeId}/products`,
      label: "Products",
    },
    {
      href: `/dashboard/stores/${storeId}/categories`,
      label: "Categories",
    },
    {
      href: `/dashboard/stores/${storeId}/subcategories`,
      label: "Subcategories",
    },
  ];

  return (
    <nav aria-label="Catalog" className="mb-6">
      <div className="flex flex-wrap gap-2">
        {items.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background"
                  : "rounded-lg border border-border px-4 py-2 text-sm font-semibold"
              }
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
