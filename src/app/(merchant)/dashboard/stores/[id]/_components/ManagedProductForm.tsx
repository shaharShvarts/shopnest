"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import type { Category, Product, Subcategory } from "@/drizzle/schema";
import {
  addManagedProduct,
  editManagedProduct,
} from "../_actions/catalog";
import { ManagedImageUpload } from "./ManagedImageUpload";

const initialState = { success: false, errors: {} as Record<string, string[]> };

export function ManagedProductForm({
  storeId,
  tenantSlug,
  categories,
  subcategories,
  product,
}: {
  storeId: number;
  tenantSlug: string;
  categories: Category[];
  subcategories: Subcategory[];
  product?: Product | null;
}) {
  const t = useTranslations("StoreCatalogManagement");
  const action = product
    ? editManagedProduct.bind(null, storeId, product.id)
    : addManagedProduct.bind(null, storeId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(380px,0.85fr)]">
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
            defaultValue={product?.name ?? ""}
            className="min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-base"
          />
          {state.errors?.name?.map((message) => (
            <p key={message} className="mt-2 text-sm text-destructive">
              {message}
            </p>
          ))}
        </div>

        <div>
          <label htmlFor="description" className="mb-2 block text-sm font-semibold">
            {t("description")}
          </label>
          <textarea
            id="description"
            name="description"
            defaultValue={product?.description ?? ""}
            className="min-h-32 w-full rounded-xl border border-border bg-background px-4 py-3 text-base"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="categoryId" className="mb-2 block text-sm font-semibold">
              {t("category")}
            </label>
            <select
              id="categoryId"
              name="categoryId"
              required
              defaultValue={product?.categoryId ?? ""}
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

          <div>
            <label htmlFor="subcategoryId" className="mb-2 block text-sm font-semibold">
              {t("subcategory")}
            </label>
            <select
              id="subcategoryId"
              name="subcategoryId"
              defaultValue={product?.subcategoryId ?? ""}
              className="min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-base"
            >
              <option value="">{t("noSubcategory")}</option>
              {subcategories.map((subcategory) => (
                <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
              ))}
            </select>
            {state.errors?.subcategoryId?.map((message) => (
              <p key={message} className="mt-2 text-sm text-destructive">
                {message}
              </p>
            ))}
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <NumberField name="price" label={t("price")} defaultValue={product?.price} error={state.errors?.price} />
          <NumberField name="quantity" label={t("quantity")} defaultValue={product?.quantity} error={state.errors?.quantity} />
          <NumberField
            name="lowStockThreshold"
            label={t("lowStockThreshold")}
            defaultValue={product?.lowStockThreshold ?? 10}
            error={state.errors?.lowStockThreshold}
          />
          <NumberField
            name="criticalStockThreshold"
            label={t("criticalStockThreshold")}
            defaultValue={product?.criticalStockThreshold ?? 4}
            error={state.errors?.criticalStockThreshold}
          />
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
          initialImage={product?.imageUrl}
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

function NumberField({
  name,
  label,
  defaultValue,
  error,
}: {
  name: string;
  label: string;
  defaultValue?: number;
  error?: string[];
}) {
  return (
    <div>
      <label htmlFor={name} className="mb-2 block text-sm font-semibold">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        min="0"
        required
        defaultValue={defaultValue ?? ""}
        className="min-h-12 w-full rounded-xl border border-border bg-background px-4 py-3 text-base"
      />
      {error?.map((message) => (
        <p key={message} className="mt-2 text-sm text-destructive">
          {message}
        </p>
      ))}
    </div>
  );
}
