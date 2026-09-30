"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { Category, Subcategory } from "@/drizzle/schema";
import {
  addManagedSubcategory,
  editManagedSubcategory,
} from "../_actions/catalog";
import { ManagedImageUpload } from "./ManagedImageUpload";

const initialState = { success: false, errors: {} as Record<string, string[]> };

export function ManagedSubcategoryForm({
  storeId,
  tenantSlug,
  categories,
  subcategory,
}: {
  storeId: number;
  tenantSlug: string;
  categories: Category[];
  subcategory?: Subcategory | null;
}) {
  const t = useTranslations("StoreCatalogManagement");
  const action = subcategory
    ? editManagedSubcategory.bind(null, storeId, subcategory.id)
    : addManagedSubcategory.bind(null, storeId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
      <div className="space-y-6">
        <div>
          <label htmlFor="name" className="mb-2 block text-sm font-semibold">
            {t("name")}
          </label>
          <input
            id="name"
            name="name"
            required
            autoFocus
            defaultValue={subcategory?.name ?? ""}
            className="min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-base"
          />
          {state.errors?.name?.map((message) => (
            <p key={message} className="mt-2 text-sm text-destructive">
              {message}
            </p>
          ))}
        </div>

        <div>
          <label htmlFor="categoryId" className="mb-2 block text-sm font-semibold">
            {t("category")}
          </label>
          <select
            id="categoryId"
            name="categoryId"
            required
            defaultValue={subcategory?.categoryId ?? ""}
            className="min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-base"
          >
            <option value="" disabled>{t("selectCategory")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          {state.errors?.categoryId?.map((message) => (
            <p key={message} className="mt-2 text-sm text-destructive">
              {message}
            </p>
          ))}
        </div>

        <button
          type="submit"
          disabled={pending}
          className="min-h-12 rounded-xl bg-foreground px-6 py-3 font-semibold text-background disabled:opacity-50"
        >
          {pending ? t("saving") : t("save")}
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">{t("image")}</p>
        <ManagedImageUpload
          tenantSlug={tenantSlug}
          initialImage={subcategory?.imageUrl}
        />
        {state.errors?.image?.map((message) => (
          <p key={message} className="text-sm text-destructive">
            {message}
          </p>
        ))}
      </div>
    </form>
  );
}
