"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionState, useState } from "react";
import { addCategory, editCategory } from "../../_actions/categories";
import { Category } from "@/drizzle/schema/category";
import prettyBytes from "pretty-bytes";

export default function CategoryForm({
  category,
}: {
  category?: Category | null;
}) {
  const [state, formAction, isPending] = useActionState(
    category == null ? addCategory : editCategory.bind(null, category.id),
    {
      success: false,
      fields: {},
      errors: {},
    }
  );

  const [name, setName] = useState<string>(category?.name || "");
  const [image, setImage] = useState<File | null>(null);
  const maxFileSize = Number(process.env.NEXT_PUBLIC_MAX_FILE_SIZE ?? 0);

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
        {state.errors?.name && (
          <div className="text-destructive">{state.errors.name.join(", ")}</div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="image">Image</Label>
        <Input
          type="file"
          id="image"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0] ?? null;

            if (file && file.size > maxFileSize) {
              alert(
                `File size exceeds ${maxFileSize}, Please choose a smaller image.`
              );
              e.target.value = "";
              return;
            }

            // setImage(file);
          }}
          required={category == null}
          name="image"
        />
        {category != null && (
          <Image
            src={category.imageUrl}
            width={400}
            height={400}
            alt={category.name}
          />
        )}

        {state.errors?.image && (
          <div className="text-destructive">
            {state.errors.image.join(", ")}
          </div>
        )}
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
