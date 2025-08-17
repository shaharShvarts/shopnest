"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useActionState, useRef, useState } from "react";
import { Combobox } from "../../_components/Combobox";
import { Subcategory, Category } from "@/drizzle/schema";
import { ImageUpload } from "../../_components/ImageUpload";
import { addSubcategory, editSubcategory } from "../../_actions/subcategories";

type SubcategoryFormProps = {
  subcategory?: Subcategory | null;
  categoryList: Category[];
};

export default function SubcategoryForm({
  subcategory,
  categoryList,
}: SubcategoryFormProps) {
  const action = !subcategory
    ? addSubcategory
    : editSubcategory.bind(null, subcategory.id);
  const [state, formAction, isPending] = useActionState(action, {
    success: false,
    errors: {},
  });

  const [categoryId, setCategoryId] = useState<string | null>(
    subcategory?.categoryId.toString() || null
  );

  return (
    <form action={formAction} className="space-y-8">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          type="text"
          id="name"
          required
          name="name"
          defaultValue={subcategory?.name || ""}
        />
        {state?.errors?.name && (
          <div className="text-destructive">{state.errors.name}</div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="categoryId">Category</Label>
        <Input type="hidden" name="categoryId" value={categoryId || ""}></Input>
        <Combobox
          setId={setCategoryId}
          list={categoryList}
          selected={categoryId}
        />
      </div>

      <div className="space-y-2">
        <ImageUpload initialImage={subcategory?.imageUrl} />
        {state?.errors?.image && (
          <div className="text-destructive">{state.errors.image}</div>
        )}
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
