"use client";

import { useActionState } from "react";
import type { Category } from "@/drizzle/schema";
import {
  addManagedCategory,
  editManagedCategory,
} from "../_actions/catalog";

const initialState = { success: false, errors: {} as Record<string, string[]> };

export function ManagedCategoryForm({
  storeId,
  category,
}: {
  storeId: number;
  category?: Category | null;
}) {
  const action = category
    ? editManagedCategory.bind(null, storeId, category.id)
    : addManagedCategory.bind(null, storeId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-semibold">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={category?.name ?? ""}
          className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2"
        />
        {state.errors?.name?.map((message) => (
          <p key={message} className="mt-1 text-sm text-destructive">
            {message}
          </p>
        ))}
      </div>

      <div>
        <label htmlFor="image" className="mb-1 block text-sm font-semibold">
          {category ? "Replacement image (optional)" : "Image"}
        </label>
        <input
          id="image"
          name="image"
          type="file"
          accept="image/*"
          required={!category}
          className="block w-full rounded-lg border border-border bg-background px-3 py-2"
        />
        {category?.imageUrl ? (
          <p className="mt-1 break-all text-xs text-muted-foreground">
            Current: {category.imageUrl}
          </p>
        ) : null}
        {state.errors?.image?.map((message) => (
          <p key={message} className="mt-1 text-sm text-destructive">
            {message}
          </p>
        ))}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-11 rounded-lg bg-foreground px-5 py-2.5 font-semibold text-background disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
