import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import type { StoreSummary } from "@/lib/control-plane/core";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StoreStatusBadge } from "./StoreStatusBadge";

export async function StoreTable({ stores }: { stores: StoreSummary[] }) {
  const t = await getTranslations("ControlPlane");

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("store")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("plan")}</TableHead>
            <TableHead>{t("orders")}</TableHead>
            <TableHead>{t("sales")}</TableHead>
            <TableHead>{t("lastActivity")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {stores.map((store) => {
            const displayStatus =
              store.storeStatus === "provisioned" && store.tenantStatus
                ? store.tenantStatus
                : store.storeStatus;
            const notProvisioned = store.reason === "not_provisioned";

            return (
              <TableRow key={store.storeId}>
                <TableCell>
                  <Link
                    className="font-semibold text-indigo-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-200"
                    href={`/admin/stores/${store.slug}`}
                  >
                    {store.displayName}
                  </Link>
                  <div className="font-mono text-xs text-slate-500">
                    {store.slug}
                  </div>
                </TableCell>
                <TableCell>
                  <StoreStatusBadge
                    status={displayStatus}
                    label={t(displayStatus)}
                  />
                </TableCell>
                <TableCell>{store.subscriptionPlanName ?? "—"}</TableCell>
                <TableCell>
                  {store.kind === "available"
                    ? formatNumber(store.metrics.orderCount)
                    : notProvisioned
                      ? t("notProvisioned")
                      : t("unavailable")}
                </TableCell>
                <TableCell>
                  {store.kind === "available"
                    ? formatCurrency(store.metrics.salesVolume)
                    : notProvisioned
                      ? t("notProvisioned")
                      : t("unavailable")}
                </TableCell>
                <TableCell>
                  {store.kind === "available" && store.metrics.lastActivity
                    ? new Intl.DateTimeFormat(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(store.metrics.lastActivity)
                    : store.kind === "available"
                      ? t("noActivity")
                      : notProvisioned
                        ? t("notProvisioned")
                        : t("unavailable")}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
