import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function ManagementSelect({
  className,
  wrapperClassName,
  children,
  ...props
}: React.ComponentProps<"select"> & {
  wrapperClassName?: string;
}) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <select
        data-slot="management-select"
        className={cn(
          "h-11 w-full appearance-none rounded-lg border border-slate-300 bg-white py-2 ps-3 pe-9 text-sm text-slate-950 shadow-sm transition-[border-color,box-shadow,background-color] outline-none",
          "hover:border-slate-400",
          "focus:border-slate-500 focus:ring-2 focus:ring-slate-200",
          "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 disabled:opacity-70",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute end-3 top-1/2 size-4 -translate-y-1/2 text-slate-500"
      />
    </div>
  );
}
