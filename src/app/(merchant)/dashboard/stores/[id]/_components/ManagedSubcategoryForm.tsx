"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ManagementInput } from "@/components/management/ManagementInput";
import { ManagementSelect } from "@/components/management/ManagementSelect";
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
          <ManagementInput
            id="name"
            name="name"
            required
            autoFocus
            defaultValue={subcategory?.name ?? ""}
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
          <ManagementSelect
            id="categoryId"
            name="categoryId"
            required
            defaultValue={subcategory?.categoryId ?? ""}
          >
            <option value="" disabled>{t("selectCategory")}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </ManagementSelect>
          {state.errors?.categoryId?.map((message) => (
            <p key={message} className="mt-2 text-sm text-destructive">
              {message}
            </p>
          ))}
        </div>

        <Button
          type="submit"
          size="management"
          disabled={pending}
          className="px-6"
        >
          {pending ? t("saving") : t("save")}
        </Button>
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
