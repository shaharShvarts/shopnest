import type { StoreStatus, TenantStatus } from "@/drizzle/control-schema/shared";

type DisplayStatus = StoreStatus | TenantStatus;

const styles: Record<DisplayStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  ready_for_provisioning: "bg-blue-100 text-blue-800",
  activation_requested: "bg-blue-100 text-blue-800",
  provisioning: "bg-indigo-100 text-indigo-800",
  provisioning_failed: "bg-red-100 text-red-800",
  provisioned: "bg-emerald-100 text-emerald-800",
  active: "bg-emerald-100 text-emerald-800",
  suspended: "bg-amber-100 text-amber-900",
  disabled: "bg-slate-200 text-slate-700",
};

export function StoreStatusBadge({
  status,
  label = status,
}: {
  status: DisplayStatus;
  label?: string;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${styles[status]}`}
    >
      {label}
    </span>
  );
}
