import { notFound } from "next/navigation";
import { TenantProvider } from "@/context/TenantContext";
import { getTenant } from "@/lib/tenant-context";

export default async function TenantLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ tenant: string }>;
}) {
  const tenant = await getTenant();
  if (!tenant || tenant.slug !== (await params).tenant) notFound();
  return <TenantProvider key={tenant.slug} slug={tenant.slug} basePath={tenant.basePath}>{children}</TenantProvider>;
}
