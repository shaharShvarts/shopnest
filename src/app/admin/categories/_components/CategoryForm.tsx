"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionState, useState } from "react";
import { addCategory, editCategory } from "../../_actions/categories";
import { Category } from "@/drizzle/schema";
import { ImageUpload } from "../../_components/ImageUpload";

type CategoryFormProps = {
  category?: Category | null;
};
export default function CategoryForm({ category }: CategoryFormProps) {
  const [state, formAction, isPending] = useActionState(
    category == null ? addCategory : editCategory.bind(null, category.id),
    {
      success: false,
      errors: {},
    }
  );

  const [name, setName] = useState<string>(category?.name || "");

  return (
    <form action={formAction} className="space-y-8">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          type="text"
          id="name"
          required
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {state?.errors?.name && (
          <div className="text-destructive">{state.errors.name}</div>
        )}
      </div>

      <div className="space-y-2">
        <ImageUpload initialImage={category?.imageUrl} />
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
