import { notFound } from "next/navigation";
import { TenantProvider } from "@/context/TenantContext";
import {
  getTenant,
  getTenantRouteMode,
} from "@/lib/tenant-context";

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const [tenant, routeMode, routeParams] = await Promise.all([
    getTenant(),
    getTenantRouteMode(),
    params,
  ]);

  if (!tenant || !routeMode || tenant.slug !== routeParams.tenant) {
    notFound();
  }

  return (
    <TenantProvider
      key={tenant.slug}
      slug={tenant.slug}
      basePath={routeMode === "host" ? "" : tenant.basePath}
    >
      {children}
    </TenantProvider>
  );
}
