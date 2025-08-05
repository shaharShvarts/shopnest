"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionState, useEffect, useRef, useState } from "react";
import { addCategory, editCategory } from "../../_actions/categories";
import { Category } from "@/drizzle/schema/category";
import prettyBytes from "pretty-bytes";
import { isValidImage } from "@/lib/isValidImage";
import { set } from "zod";
// category == null ? addCategory : editCategory.bind(null, category.id)
export default function CategoryForm({
  category,
}: {
  category?: Category | null;
}) {
  const [state, formAction, isPending] = useActionState(
    category == null ? addCategory : editCategory.bind(null, category.id),
    {
      success: false,
      errors: {},
    }
  );

  const [name, setName] = useState<string>(category?.name || "");
  const [image, setImage] = useState<string | null>(category?.imageUrl || null);
  const [preview, setPreview] = useState<string | null>(
    category?.imageUrl || null
  );

  useEffect(() => {
    if (state?.errors?.name) {
      setPreview(null);
      console.info("Error in name field:", state.errors.name);
    }
  }, [state?.errors?.name]);

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
        <Label htmlFor="image">Image</Label>
        <Input
          type="file"
          id="image"
          name="image"
          accept="image/*"
          required={category == null}
          onChange={(e) => {
            const file = e.target.files?.[0] || null;
            if (!isValidImage(file)) {
              setPreview(null);
              e.target.value = ""; // Clear the input if the file is invalid
              return;
            }
            setImage(file ? file.name : null);
            setPreview(URL.createObjectURL(file as Blob));
          }}
        />

        {state?.errors?.image && (
          <div className="text-destructive">{state.errors.image}</div>
        )}
        {preview && (
          <Image
            src={preview}
            width={400}
            height={400}
            title={image || "Category Image Preview"}
            alt="Preview"
          />
        )}
      </div>
      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving..." : "Save"}
      </Button>
    </form>
  );
}
