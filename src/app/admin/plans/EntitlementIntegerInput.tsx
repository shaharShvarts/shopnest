"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function EntitlementIntegerInput({
  name,
  initialValue,
  unlimitedLabel,
}: {
  name: string;
  initialValue: number;
  unlimitedLabel: string;
}) {
  const [value, setValue] = useState<number>(initialValue);
  const unlimited = value === -1;

  function step(delta: number) {
    setValue((current) => {
      const base = current === -1 ? 0 : current;
      return Math.max(0, base + delta);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <input type="hidden" name={name} value={value} />

      <div className="flex h-11 min-w-28 items-stretch overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm transition-[border-color,box-shadow] hover:border-slate-400 focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-200">
        <div className="flex min-w-0 flex-1 items-center px-3 py-2">
          <span className="whitespace-nowrap tabular-nums">
            {unlimited ? unlimitedLabel : value}
          </span>
        </div>

        <div className="flex w-10 shrink-0 flex-col border-s">
          <button
            type="button"
            aria-label="Increase"
            onClick={() => step(1)}
            className="flex flex-1 items-center justify-center border-b border-slate-200 text-sm outline-none hover:bg-slate-50 focus-visible:bg-slate-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-300"
          >
            ▲
          </button>
          <button
            type="button"
            aria-label="Decrease"
            onClick={() => step(-1)}
            disabled={!unlimited && value <= 0}
            className="flex flex-1 items-center justify-center text-sm outline-none hover:bg-slate-50 focus-visible:bg-slate-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ▼
          </button>
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="management"
        aria-pressed={unlimited}
        onClick={() => setValue(-1)}
        className="shrink-0 px-3 text-sm text-blue-700"
      >
        {unlimitedLabel}
      </Button>
    </div>
  );
}
