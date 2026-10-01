"use client";

import { useState } from "react";

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
    <div className="space-y-1">
      <input type="hidden" name={name} value={value} />

      <div className="flex min-h-11 items-stretch overflow-hidden rounded-md border bg-white">
        <div className="flex min-w-0 flex-1 items-center px-3 py-2">
          <span className="tabular-nums">
            {unlimited ? unlimitedLabel : value}
          </span>
        </div>

        <div className="flex w-10 flex-col border-s">
          <button
            type="button"
            aria-label="Increase"
            onClick={() => step(1)}
            className="flex flex-1 items-center justify-center border-b text-sm hover:bg-slate-50"
          >
            ▲
          </button>
          <button
            type="button"
            aria-label="Decrease"
            onClick={() => step(-1)}
            disabled={!unlimited && value <= 0}
            className="flex flex-1 items-center justify-center text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            ▼
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setValue(-1)}
        className="text-sm font-medium text-blue-700 underline underline-offset-2"
      >
        {unlimitedLabel}
      </button>
    </div>
  );
}
