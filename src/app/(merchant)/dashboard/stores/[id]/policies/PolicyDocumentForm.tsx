"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import type {
  StorePolicyStatus,
  StorePolicyType,
} from "@/lib/merchant-policies/core";
import {
  mutatePolicyAction,
  type PolicyMutationState,
} from "./_actions";

const MIN_POLICY_CONTENT_LENGTH = 80;
const MIN_POLICY_TITLE_LENGTH = 3;

type PolicyDocumentEditorProps = {
  storeId: number;
  policyType: StorePolicyType;
  policyLabel: string;
  initialVersion: number | null;
  initialStatus: StorePolicyStatus | null;
  defaultTitle: string;
  defaultContent: string;
  labels: {
    documentTitle: string;
    content: string;
    contentHelp: string;
    saveDraft: string;
    publish: string;
    draft: string;
    published: string;
    missing: string;
    notCreated: string;
    version: string;
    saved: string;
    invalid: string;
    unavailable: string;
    unsavedChanges: string;
    characters: string;
  };
};

const INITIAL_ACTION_STATE: PolicyMutationState = { kind: "idle" };

export function PolicyDocumentEditor({
  storeId,
  policyType,
  policyLabel,
  initialVersion,
  initialStatus,
  defaultTitle,
  defaultContent,
  labels,
}: PolicyDocumentEditorProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [content, setContent] = useState(defaultContent);
  const [savedTitle, setSavedTitle] = useState(defaultTitle);
  const [savedContent, setSavedContent] = useState(defaultContent);
  const [version, setVersion] = useState(initialVersion);
  const [documentStatus, setDocumentStatus] =
    useState<StorePolicyStatus | null>(initialStatus);
  const [actionState, formAction, pending] = useActionState(
    mutatePolicyAction,
    INITIAL_ACTION_STATE
  );

  useEffect(() => {
    if (
      actionState.kind !== "saved" &&
      actionState.kind !== "published"
    ) {
      return;
    }

    setTitle(actionState.title);
    setContent(actionState.content);
    setSavedTitle(actionState.title);
    setSavedContent(actionState.content);
    setVersion(actionState.version);
    setDocumentStatus(actionState.documentStatus);
  }, [actionState]);

  const trimmedTitleLength = title.trim().length;
  const trimmedContentLength = content.trim().length;
  const dirty = title !== savedTitle || content !== savedContent;

  const canSubmit = useMemo(
    () =>
      !pending &&
      dirty &&
      trimmedTitleLength >= MIN_POLICY_TITLE_LENGTH &&
      trimmedContentLength >= MIN_POLICY_CONTENT_LENGTH,
    [dirty, pending, trimmedTitleLength, trimmedContentLength]
  );

  const statusLabel =
    documentStatus === "published"
      ? labels.published
      : documentStatus === "draft"
        ? labels.draft
        : labels.missing;

  const versionLabel =
    version === null
      ? labels.notCreated
      : labels.version.replace("{version}", String(version));

  const showSuccess =
    !dirty &&
    (actionState.kind === "saved" ||
      actionState.kind === "published");

  return (
    <section className="rounded-2xl bg-background p-5 shadow-sm ring-1 ring-black/5 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{policyLabel}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {versionLabel}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dirty ? (
            <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
              {labels.unsavedChanges}
            </span>
          ) : null}
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold">
            {statusLabel}
          </span>
        </div>
      </div>

      {showSuccess ? (
        <p role="status" className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm">
          {actionState.kind === "saved"
            ? labels.saved
            : labels.published}
        </p>
      ) : null}

      {actionState.kind === "invalid" ? (
        <p role="alert" className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm">
          {labels.invalid}
        </p>
      ) : null}

      {actionState.kind === "unavailable" ? (
        <p role="alert" className="mt-4 rounded-xl bg-muted px-4 py-3 text-sm">
          {labels.unavailable}
        </p>
      ) : null}

      <form action={formAction} className="mt-5 space-y-4" noValidate>
        <input type="hidden" name="storeId" value={storeId} />
        <input type="hidden" name="policyType" value={policyType} />

        <div>
          <label
            htmlFor={policyType + "-title"}
            className="block text-sm font-semibold"
          >
            {labels.documentTitle}
          </label>
          <input
            id={policyType + "-title"}
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            className="mt-2 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor={policyType + "-content"}
            className="block text-sm font-semibold"
          >
            {labels.content}
          </label>
          <textarea
            id={policyType + "-content"}
            name="content"
            maxLength={100000}
            rows={10}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-2"
          />
          <div className="mt-2 flex flex-wrap items-start justify-between gap-2 text-xs text-muted-foreground">
            <p>{labels.contentHelp}</p>
            <p aria-live="polite">
              <span dir="ltr">
                {trimmedContentLength} / {MIN_POLICY_CONTENT_LENGTH}
              </span>{" "}
              {labels.characters}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            name="intent"
            value="publish"
            disabled={!canSubmit}
            className="min-h-11 rounded-lg bg-foreground px-5 py-2.5 font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "…" : labels.publish}
          </button>
          <button
            type="submit"
            name="intent"
            value="draft"
            disabled={!canSubmit}
            className="min-h-11 rounded-lg border border-border px-5 py-2.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "…" : labels.saveDraft}
          </button>
        </div>
      </form>
    </section>
  );
}
