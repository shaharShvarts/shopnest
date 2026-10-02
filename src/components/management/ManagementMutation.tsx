"use client";

import type { FormEvent, ReactNode } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "react-toastify";

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

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    startTransition(async () => {
      try {
        const result = await action(formData);
        if (result && !result.ok) {
          const message = resolveMessage(result, messages, failureMessage);
          if (message) toast.error(message);
          return;
        }

        if (resetOnSuccess) form.reset();

        const message =
          result && result.ok
            ? resolveMessage(result, messages, successMessage)
            : successMessage;
        if (message) toast.success(message);

        router.refresh();
      } catch {
        if (failureMessage) {
          toast.error(failureMessage);
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

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        type="button"
        variant={variant}
        size="management"
        disabled={pending}
        aria-busy={pending}
        onClick={() => {
                startTransition(async () => {
            try {
              const result = await action();
              if (result && !result.ok) {
                const message = resolveMessage(result, messages, failureMessage);
                if (message) toast.error(message);
                return;
              }

              const message =
                result && result.ok
                  ? resolveMessage(result, messages, successMessage)
                  : successMessage;
              if (message) toast.success(message);

              router.refresh();
            } catch {
              if (failureMessage) {
                toast.error(failureMessage);
              }
            }
          });
        }}
        className={className}
      >
        {pending ? pendingLabel : label}
      </Button>
    </div>
  );
}
