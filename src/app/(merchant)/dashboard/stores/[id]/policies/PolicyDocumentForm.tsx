"use client";

import { useMemo, useState } from "react";
import type { StorePolicyType } from "@/lib/merchant-policies/core";
import {
  publishPolicyAction,
  savePolicyDraftAction,
} from "./_actions";

const MIN_POLICY_CONTENT_LENGTH = 80;
const MIN_POLICY_TITLE_LENGTH = 3;

type PolicyDocumentFormProps = {
  storeId: number;
  policyType: StorePolicyType;
  defaultTitle: string;
  defaultContent: string;
  labels: {
    documentTitle: string;
    content: string;
    contentHelp: string;
    saveDraft: string;
    publish: string;
    characterCount: string;
  };
};

export function PolicyDocumentForm({
  storeId,
  policyType,
  defaultTitle,
  defaultContent,
  labels,
}: PolicyDocumentFormProps) {
  const [title, setTitle] = useState(defaultTitle);
  const [content, setContent] = useState(defaultContent);

  const trimmedTitleLength = title.trim().length;
  const trimmedContentLength = content.trim().length;
  const canSubmit = useMemo(
    () =>
      trimmedTitleLength >= MIN_POLICY_TITLE_LENGTH &&
      trimmedContentLength >= MIN_POLICY_CONTENT_LENGTH,
    [trimmedTitleLength, trimmedContentLength]
  );

  return (
    <form className="mt-5 space-y-4" noValidate>
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
          <p>
            {labels.characterCount
              .replace("{count}", String(trimmedContentLength))
              .replace("{minimum}", String(MIN_POLICY_CONTENT_LENGTH))}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          formAction={savePolicyDraftAction}
          disabled={!canSubmit}
          className="min-h-11 rounded-lg border border-border px-5 py-2.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
        >
          {labels.saveDraft}
        </button>
        <button
          formAction={publishPolicyAction}
          disabled={!canSubmit}
          className="min-h-11 rounded-lg bg-foreground px-5 py-2.5 font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          {labels.publish}
        </button>
      </div>
    </form>
  );
}
