import type { TenantStatus } from "@/lib/admin-auth/core";

const styles: Record<TenantStatus, string> = {
  active: "bg-emerald-100 text-emerald-800",
  suspended: "bg-amber-100 text-amber-900",
  disabled: "bg-slate-200 text-slate-700",
};

export function StoreStatusBadge({ status, label = status }: { status: TenantStatus; label?: string }) {
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${styles[status]}`}>{label}</span>;
}
