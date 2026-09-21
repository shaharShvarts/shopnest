"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", key: "overview" },
  { href: "/dashboard/business", key: "business" },
  { href: "/dashboard/stores", key: "stores" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function DashboardNavigation() {
  const pathname = usePathname();
  const t = useTranslations("MerchantDashboard");

  return (
    <nav aria-label={t("navigation")} className="w-full">
      <ul className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
        {items.map((item) => {
          const active = isActive(pathname, item.href);

          return (
            <li key={item.href} className="shrink-0 md:shrink">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 w-full items-center rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                  active
                    ? "bg-foreground text-background"
                    : "text-foreground hover:bg-muted"
                )}
              >
                {t(item.key)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
