"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { prefixTenantPath } from "@/lib/tenant";

type TenantContextValue = {
  basePath: string;
  path: (path: string) => string;
};

const TenantContext = createContext<TenantContextValue>({
  basePath: "",
  path: (path) => path,
});

export function TenantProvider({
  basePath,
  children,
}: {
  basePath: string;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({
      basePath,
      path: (path: string) => prefixTenantPath(path, basePath),
    }),
    [basePath]
  );

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  );
}

export function useTenant() {
  return useContext(TenantContext);
}
