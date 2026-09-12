"use client";

import Link, { type LinkProps } from "next/link";
import { forwardRef, type AnchorHTMLAttributes } from "react";
import { useTenant } from "@/context/TenantContext";

type TenantLinkProps = LinkProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>;

export const TenantLink = forwardRef<HTMLAnchorElement, TenantLinkProps>(
  function TenantLink({ href, as, ...props }, ref) {
    const tenant = useTenant();
    const scope = (url: LinkProps["href"]) => {
      if (typeof url === "string") return tenant.path(url);
      if (url.host || url.hostname || url.protocol || url.auth) throw new Error("Tenant links must be local");
      return { ...url, pathname: tenant.path(url.pathname || "/") };
    };
    const tenantHref = scope(href);

    return <Link ref={ref} href={tenantHref} as={as === undefined ? undefined : scope(as)} {...props} />;
  }
);
