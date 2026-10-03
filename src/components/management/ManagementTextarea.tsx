import * as React from "react";
import { cn } from "@/lib/utils";

export function ManagementTextarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="management-textarea"
      className={cn(
        "min-h-28 w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition-[border-color,box-shadow,background-color]",
        "placeholder:text-slate-400",
        "hover:border-slate-400",
        "focus:border-slate-500 focus:ring-2 focus:ring-slate-200",
        "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-70",
        "aria-invalid:border-red-400 aria-invalid:ring-2 aria-invalid:ring-red-100",
        className
      )}
      {...props}
    />
  );
}
