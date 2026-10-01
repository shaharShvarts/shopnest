"use client";

import { useEffect } from "react";

const FLASH_COOKIE = "SHOPNEST_PLAN_RESULT";

export default function PlanFlashMessage({
  message,
}: {
  message: string;
}) {
  useEffect(() => {
    document.cookie = `${FLASH_COOKIE}=; path=/admin/plans; max-age=0; SameSite=Lax`;
  }, []);

  return (
    <p
      role="status"
      className="rounded-lg border bg-white px-4 py-3 text-sm shadow-sm"
    >
      {message}
    </p>
  );
}
