"use client";

import { useActionState } from "react";
import type { Category, Product, Subcategory } from "@/drizzle/schema";
import {
  addManagedProduct,
  editManagedProduct,
} from "../_actions/catalog";

const initialState = { success: false, errors: {} as Record<string, string[]> };

export function ManagedProductForm({
  storeId,
  categories,
  subcategories,
  product,
}: {
  storeId: number;
  categories: Category[];
  subcategories: Subcategory[];
  product?: Product | null;
}) {
  const action = product
    ? editManagedProduct.bind(null, storeId, product.id)
    : addManagedProduct.bind(null, storeId);
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
          defaultValue={product?.name ?? ""}
          className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2"
        />
        {state.errors?.name?.map((message) => (
          <p key={message} className="mt-1 text-sm text-destructive">
            {message}
          </p>
        ))}
      </div>

      <div>
        <label htmlFor="description" className="mb-1 block text-sm font-semibold">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          defaultValue={product?.description ?? ""}
          className="min-h-28 w-full rounded-lg border border-border bg-background px-3 py-2"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="categoryId" className="mb-1 block text-sm font-semibold">
            Category
          </label>
          <select
            id="categoryId"
            name="categoryId"
            required
            defaultValue={product?.categoryId ?? ""}
            className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2"
          >
            <option value="" disabled>
              Select category
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
          <label htmlFor="subcategoryId" className="mb-1 block text-sm font-semibold">
            Subcategory
          </label>
          <select
            id="subcategoryId"
            name="subcategoryId"
            defaultValue={product?.subcategoryId ?? ""}
            className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2"
          >
            <option value="">None</option>
            {subcategories.map((subcategory) => (
              <option key={subcategory.id} value={subcategory.id}>
                {subcategory.name}
              </option>
            ))}
          </select>
          {state.errors?.subcategoryId?.map((message) => (
            <p key={message} className="mt-1 text-sm text-destructive">
              {message}
            </p>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          name="price"
          label="Price"
          defaultValue={product?.price}
          error={state.errors?.price}
        />
        <NumberField
          name="quantity"
          label="Quantity"
          defaultValue={product?.quantity}
          error={state.errors?.quantity}
        />
        <NumberField
          name="lowStockThreshold"
          label="Low-stock threshold"
          defaultValue={product?.lowStockThreshold ?? 10}
          error={state.errors?.lowStockThreshold}
        />
        <NumberField
          name="criticalStockThreshold"
          label="Critical-stock threshold"
          defaultValue={product?.criticalStockThreshold ?? 4}
          error={state.errors?.criticalStockThreshold}
        />
      </div>

      <div>
        <label htmlFor="image" className="mb-1 block text-sm font-semibold">
          {product ? "Replacement image (optional)" : "Image"}
        </label>
        <input
          id="image"
          name="image"
          type="file"
          accept="image/*"
          required={!product}
          className="block w-full rounded-lg border border-border bg-background px-3 py-2"
        />
        {product?.imageUrl ? (
          <p className="mt-1 break-all text-xs text-muted-foreground">
            Current: {product.imageUrl}
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
      <label htmlFor={name} className="mb-1 block text-sm font-semibold">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="number"
        min="0"
        required
        defaultValue={defaultValue ?? ""}
        className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2"
      />
      {error?.map((message) => (
        <p key={message} className="mt-1 text-sm text-destructive">
          {message}
        </p>
      ))}
    </div>
  );
}
