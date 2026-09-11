import { getTranslations } from "next-intl/server";
import { getControlPlaneOverview } from "@/lib/control-plane/server";
import { StoreTable } from "../_components/StoreTable";

export const dynamic = "force-dynamic";

export default async function StoresPage() {
  const [{ stores }, t] = await Promise.all([getControlPlaneOverview(), getTranslations("ControlPlane")]);
  return <div className="space-y-6"><header><h1 className="text-3xl font-bold">{t("stores")}</h1><p className="mt-2 text-slate-600">{t("storesDescription")}</p></header><StoreTable stores={stores} /></div>;
}
