"use client";

import { cn } from "@/lib/utils";
import { TenantLink as Link } from "@/components/TenantLink";
import { usePathname } from "next/navigation";
import { ComponentProps, ReactNode } from "react";
import { useTenant } from "@/context/TenantContext";

export function Nav({ children }: { children: ReactNode }) {
  return (
    <nav className="bg-primary text-primary-foreground flex justify-center px-4">
      {children}
    </nav>
  );
}

export function NavLink(props: Omit<ComponentProps<typeof Link>, "className">) {
  const pathname = usePathname();
  const tenant = useTenant();

  return (
    <Link
      {...props}
      className={cn(
        "p-4 hover:bg-secondary hover:text-secondary-foreground focus-visible:bg-secondary focus-visible:text-secondary-foreground text-background",
        pathname === tenant.path(String(props.href)) &&
          " bg-background text-foreground"
      )}
    />
  );
}
