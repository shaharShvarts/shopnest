"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export type AdminNavigationItem = {
  href: string;
  label: string;
};

export function AdminNavigation({
  items,
  ariaLabel,
}: {
  items: AdminNavigationItem[];
  ariaLabel: string;
}) {
  const pathname = usePathname();

  return (
    <nav
      className="border-b border-slate-200 bg-white"
      aria-label={ariaLabel}
    >
      <div className="container mx-auto flex gap-2 overflow-x-auto px-4 py-2">
        {items.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2",
                active
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
