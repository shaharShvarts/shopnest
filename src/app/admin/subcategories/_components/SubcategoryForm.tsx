"use client";

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useActionState, useEffect, useState } from "react";

import { isValidImage } from "@/lib/isValidImage";
import { Subcategory, Category } from "@/drizzle/schema";
import { Combobox } from "../../_components/Combobox";
import { addSubcategory, editSubcategory } from "../../_actions/subcategories";
import { ScissorsLineDashedIcon } from "lucide-react";

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

  const [name, setName] = useState<string>(subcategory?.name || "");
  const [image, setImage] = useState<string | null>(
    subcategory?.imageUrl || null
  );
  const [preview, setPreview] = useState<string | null>(
    subcategory?.imageUrl || null
  );
  const [categoryId, setCategoryId] = useState<number>(
    subcategory?.categoryId || 0
  );

  const categoryName = categoryList.find((c) => c.id === categoryId)?.name;

  useEffect(() => {
    if (state?.errors?.name) {
      setPreview(null);
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
        <Label htmlFor="categoryId">Category</Label>
        <Input type="hidden" name="categoryId" value={categoryId}></Input>
        <Combobox
          setCategoryId={setCategoryId}
          list={categoryList}
          selected={categoryName}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="image">Image</Label>
        <Input
          type="file"
          id="image"
          name="image"
          accept="image/*"
          required={subcategory == null}
          onChange={(e) => {
            const file = e.target.files?.[0] || null;
            if (!isValidImage(file)) {
              setPreview(null);
              e.target.value = "";
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
            title={image || "subcategory Image Preview"}
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
