import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatCurrency, formatNumber } from "@/lib/formatters";
import type { StoreSummary } from "@/lib/control-plane/core";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StoreStatusBadge } from "./StoreStatusBadge";

export async function StoreTable({ stores }: { stores: StoreSummary[] }) {
  const t = await getTranslations("ControlPlane");
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <Table>
        <TableHeader><TableRow><TableHead>{t("store")}</TableHead><TableHead>{t("status")}</TableHead><TableHead>{t("plan")}</TableHead><TableHead>{t("orders")}</TableHead><TableHead>{t("sales")}</TableHead><TableHead>{t("lastActivity")}</TableHead></TableRow></TableHeader>
        <TableBody>
          {stores.map((store) => (
            <TableRow key={store.slug}>
              <TableCell><Link className="font-semibold text-indigo-700 hover:underline" href={`/shopnest/admin/stores/${store.slug}`}>{store.displayName}</Link><div className="font-mono text-xs text-slate-500">{store.slug}</div></TableCell>
              <TableCell><StoreStatusBadge status={store.status} label={t(store.status)} /></TableCell>
              <TableCell>{t(store.plan)}</TableCell>
              <TableCell>{store.kind === "available" ? formatNumber(store.metrics.orderCount) : t("unavailable")}</TableCell>
              <TableCell>{store.kind === "available" ? formatCurrency(store.metrics.salesVolume) : t("unavailable")}</TableCell>
              <TableCell>{store.kind === "available" && store.metrics.lastActivity ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(store.metrics.lastActivity) : store.kind === "available" ? t("noActivity") : t("unavailable")}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
