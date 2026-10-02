"use client";

import { useState } from "react";
import { ManagementInput } from "@/components/management/ManagementInput";

export default function PlanPriceInput({
  name,
  initialValue,
}: {
  name: string;
  initialValue: string;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <ManagementInput
      name={name}
      type="text"
      inputMode="decimal"
      required
      pattern="(?:0|[1-9][0-9]*)(?:[.,][0-9]{1,2})?"
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        if (
          next === "" ||
          /^(?:0|[1-9]\d*)(?:[.,]\d{0,2})?$/.test(next)
        ) {
          setValue(next);
        }
      }}
      placeholder="0.00"
    />
  );
}
