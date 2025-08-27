"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { startTransition, useActionState, useEffect } from "react";
import { addCategory, editCategory } from "../../_actions/categories";
import { Category } from "@/drizzle/schema";
import { ImageUpload } from "../../_components/ImageUpload";
import { useRouter } from "next/navigation";
import { toast } from "react-toastify";

type CategoryFormProps = {
  category?: Category | null;
};
export default function CategoryForm({ category }: CategoryFormProps) {
  const [state, formAction, isPending] = useActionState(
    category == null ? addCategory : editCategory.bind(null, category.id),
    {
      success: false,
      errors: {},
      message: "",
    }
  );

  const router = useRouter();

  useEffect(() => {
    if (state.success) {
      toast.success(state?.message);
      startTransition(() => {
        // setCartCount((count) => Number(count) + 1);
        router.push("/admin/categories");
      });
    } else if (state.errors && Object.keys(state.errors).length > 0) {
      toast.error(
        typeof state.errors === "string"
          ? state.errors
          : Object.values(state.errors).flat().join(", ")
      );
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-8">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          type="text"
          id="name"
          required
          name="name"
          defaultValue={category?.name || ""}
        />
        {state?.errors?.name && (
          <div className="text-destructive">{state.errors.name}</div>
        )}
      </div>

      <div className="space-y-2">
        <ImageUpload initialImage={category?.imageUrl} />
        {state.errors?.image && (
          <div className="text-destructive">{state.errors.image}</div>
        )}
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
