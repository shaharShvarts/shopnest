"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { prefixTenantPath } from "@/lib/tenant";

type TenantContextValue = {
  basePath: string;
  slug: string;
  path: (path: string) => string;
};

const TenantContext = createContext<TenantContextValue>({
  basePath: "",
  slug: "",
  path: (path) => path,
});

export function TenantProvider({
  basePath,
  slug,
  children,
}: {
  basePath: string;
  slug: string;
  children: ReactNode;
}) {
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
  return useContext(TenantContext);
}
