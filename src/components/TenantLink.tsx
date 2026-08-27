"use client";

import Link, { type LinkProps } from "next/link";
import { forwardRef, type AnchorHTMLAttributes } from "react";
import { useTenant } from "@/context/TenantContext";

type TenantLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>;

export const TenantLink = forwardRef<HTMLAnchorElement, TenantLinkProps>(
  function TenantLink({ href, ...props }, ref) {
    const tenant = useTenant();
    const tenantHref = typeof href === "string" ? tenant.path(href) : href;

    return <Link ref={ref} href={tenantHref} {...props} />;
  }
);
