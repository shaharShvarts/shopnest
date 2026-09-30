"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { Category, Subcategory } from "@/drizzle/schema";
import {
  addManagedSubcategory,
  editManagedSubcategory,
} from "../_actions/catalog";

const initialState = { success: false, errors: {} as Record<string, string[]> };

export function ManagedSubcategoryForm({
  storeId,
  categories,
  subcategory,
}: {
  storeId: number;
  categories: Category[];
  subcategory?: Subcategory | null;
}) {
  const t = useTranslations("StoreCatalogManagement");
  const action = subcategory
    ? editManagedSubcategory.bind(null, storeId, subcategory.id)
    : addManagedSubcategory.bind(null, storeId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="space-y-5">
      <div>
        <label htmlFor="name" className="mb-1 block text-sm font-semibold">
          {t("name")}
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={subcategory?.name ?? ""}
          className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2"
        />
        {state.errors?.name?.map((message) => (
          <p key={message} className="mt-1 text-sm text-destructive">
            {message}
          </p>
        ))}
      </div>

      <div>
        <label htmlFor="categoryId" className="mb-1 block text-sm font-semibold">
          {t("category")}
        </label>
        <select
          id="categoryId"
          name="categoryId"
          required
          defaultValue={subcategory?.categoryId ?? ""}
          className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2"
        >
          <option value="" disabled>
            {t("selectCategory")}
          </option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        {state.errors?.categoryId?.map((message) => (
          <p key={message} className="mt-1 text-sm text-destructive">
            {message}
          </p>
        ))}
      </div>

      <div>
        <label htmlFor="image" className="mb-1 block text-sm font-semibold">
          {subcategory ? t("replacementImage") : t("image")}
        </label>
        <input
          id="image"
          name="image"
          type="file"
          accept="image/*"
          required={!subcategory}
          className="block w-full rounded-lg border border-border bg-background px-3 py-2"
        />
        {subcategory?.imageUrl ? (
          <p className="mt-1 break-all text-xs text-muted-foreground">
            {t("currentImage", { url: subcategory.imageUrl })}
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
        {pending ? t("saving") : t("save")}
      </button>
    </form>
  );
}
