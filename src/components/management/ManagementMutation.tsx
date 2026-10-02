"use client";

import type { FormEvent, ReactNode } from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ManagementMutationResult =
  | void
  | {
      ok: boolean;
      code?: string;
    };

type MessageMap = Record<string, string>;

function resolveMessage(
  result: Exclude<ManagementMutationResult, void>,
  messages: MessageMap | undefined,
  fallback: string | undefined
) {
  if (result.code && messages?.[result.code]) {
    return messages[result.code];
  }

  return fallback ?? null;
}

export function ManagementMutationForm({
  action,
  children,
  className,
  successMessage,
  failureMessage,
  messages,
  resetOnSuccess = false,
}: {
  action: (formData: FormData) => Promise<ManagementMutationResult>;
  children: ReactNode;
  className?: string;
  successMessage?: string;
  failureMessage?: string;
  messages?: MessageMap;
  resetOnSuccess?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setStatus(null);
    startTransition(async () => {
      try {
        const result = await action(formData);
        if (result && !result.ok) {
          const message = resolveMessage(result, messages, failureMessage);
          if (message) setStatus({ kind: "error", message });
          return;
        }

        if (resetOnSuccess) form.reset();

        const message =
          result && result.ok
            ? resolveMessage(result, messages, successMessage)
            : successMessage;
        if (message) setStatus({ kind: "success", message });

        router.refresh();
      } catch {
        if (failureMessage) {
          setStatus({ kind: "error", message: failureMessage });
        }
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className={className}
      aria-busy={pending}
    >
      <fieldset disabled={pending} className="contents">
        {children}
      </fieldset>
      {status ? (
        <p
          role={status.kind === "error" ? "alert" : "status"}
          className={cn(
            "fixed inset-x-4 top-4 z-[100] mx-auto w-fit max-w-[calc(100vw-2rem)] rounded-lg border px-4 py-3 text-sm shadow-lg",
            status.kind === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          )}
        >
          {status.message}
        </p>
      ) : null}
    </form>
  );
}

export function ManagementMutationButton({
  action,
  label,
  pendingLabel = "…",
  successMessage,
  failureMessage,
  messages,
  variant = "outline",
  className,
}: {
  action: () => Promise<ManagementMutationResult>;
  label: string;
  pendingLabel?: string;
  successMessage?: string;
  failureMessage?: string;
  messages?: MessageMap;
  variant?: "default" | "outline" | "destructive" | "secondary" | "ghost" | "link";
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<
    | { kind: "success" | "error"; message: string }
    | null
  >(null);

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={variant}
        size="management"
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
          setStatus(null);
          startTransition(async () => {
            try {
              const result = await action();
              if (result && !result.ok) {
                const message = resolveMessage(result, messages, failureMessage);
                if (message) setStatus({ kind: "error", message });
                return;
              }

              const message =
                result && result.ok
                  ? resolveMessage(result, messages, successMessage)
                  : successMessage;
              if (message) setStatus({ kind: "success", message });

              router.refresh();
            } catch {
              if (failureMessage) {
                setStatus({ kind: "error", message: failureMessage });
              }
            }
          });
        }}
        className={className}
      >
        {pending ? pendingLabel : label}
      </Button>
      {status ? (
        <span
          role={status.kind === "error" ? "alert" : "status"}
          className={cn(
            "fixed inset-x-4 top-4 z-[100] mx-auto w-fit max-w-[calc(100vw-2rem)] rounded-lg border px-4 py-3 text-sm shadow-lg",
            status.kind === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          )}
        >
          {status.message}
        </span>
      ) : null}
    </div>
  );
}
