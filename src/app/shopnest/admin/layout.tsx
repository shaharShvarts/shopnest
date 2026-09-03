import { headers } from "next/headers";
import { requireSuperAdminPage } from "@/lib/admin-auth/server";
import { INTERNAL_PATH_HEADER } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export default async function ShopNestAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const internalPath = (await headers()).get(INTERNAL_PATH_HEADER);
  if (internalPath !== "/shopnest/admin/login") {
    await requireSuperAdminPage();
  }
  return children;
}
