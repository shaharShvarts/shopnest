"use client";

import { useState } from "react";

export default function EntitlementIntegerInput({
  name,
  initialValue,
}: {
  name: string;
  initialValue: number;
}) {
  const [value, setValue] = useState(String(initialValue));

  return (
    <input
      name={name}
      type="text"
      inputMode="numeric"
      pattern="-1|0|[1-9][0-9]*"
      required
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        if (
          next === "" ||
          next === "-" ||
          next === "-1" ||
          /^\d+$/.test(next)
        ) {
          setValue(next);
        }
      }}
      onBlur={() => {
        if (value === "" || value === "-") setValue("0");
      }}
      className="min-h-11 rounded-md border px-3 py-2"
    />
  );
}
