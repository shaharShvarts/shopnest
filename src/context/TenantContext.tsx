"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { normalizeTenantSlug, prefixTenantPath } from "@/lib/tenant";

type TenantContextValue = {
  basePath: string;
  slug: string;
  path: (path: string) => string;
};

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({
  basePath,
  slug,
  children,
}: {
  basePath: string;
  slug: string;
  children: ReactNode;
}) {
  if (normalizeTenantSlug(slug)?.basePath !== basePath) {
    throw new Error("Invalid tenant navigation context");
  }
  const value = useMemo(
    () => ({
      basePath,
      slug,
      path: (path: string) => prefixTenantPath(path, basePath),
    }),
    [basePath, slug]
  );

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

export function useTenant() {
  const tenant = useContext(TenantContext);
  if (!tenant) throw new Error("Tenant navigation requires TenantProvider");
  return tenant;
}
