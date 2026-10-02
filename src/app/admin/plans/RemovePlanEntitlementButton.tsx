"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { removePlanEntitlementInlineAction } from "@/app/admin/_actions/plans";

export default function RemovePlanEntitlementButton({
  planId,
  entitlementId,
  label,
  failureMessage,
}: {
  planId: number;
  entitlementId: number;
  label: string;
  failureMessage: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        size="management"
        disabled={pending}
        onClick={() => {
          setFailed(false);
          startTransition(async () => {
            const result = await removePlanEntitlementInlineAction(
              planId,
              entitlementId
            );

            if (!result.ok) {
              setFailed(true);
              return;
            }

            router.refresh();
          });
        }}
        className="border-red-200 text-red-700 hover:border-red-300 hover:bg-red-50 hover:text-red-800"
      >
        {pending ? "…" : label}
      </Button>
      {failed ? (
        <p role="alert" className="text-xs text-red-700">
          {failureMessage}
        </p>
      ) : null}
    </div>
  );
}
