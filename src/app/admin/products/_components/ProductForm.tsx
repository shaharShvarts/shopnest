"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useActionState, useEffect, useRef, useState } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Category, Product, Subcategory } from "@/drizzle/schema";
import { Combobox } from "../../_components/Combobox";
import { ImageUpload } from "../../_components/ImageUpload";
import { addProduct, editProduct } from "@/_actions/products";

type ProductFormProps = {
  product?: Product | null;
  categoryList: Category[];
};

export default function ProductForm({
  product,
  categoryList,
}: ProductFormProps) {
  const action = !product ? addProduct : editProduct.bind(null, product.id);

  const [state, formAction, isPending] = useActionState(action, {
    success: false,
    errors: {},
  });

  const prevCategoryId = useRef<string | null>(
    product?.categoryId.toString() || null
  );

  const [categoryId, setCategoryId] = useState<string | null>(
    product?.categoryId.toString() || null
  );

  const [subcategoryId, setSubcategoryId] = useState<string | null>(
    product?.subcategoryId?.toString() || null
  );

  const [subcategoryList, setSubcategoryList] = useState<Subcategory[]>([]);

  useEffect(() => {
    if (categoryId === "") {
      setSubcategoryId("");
      setSubcategoryList([]);
      console.log("Category ID is empty, resetting subcategory ID and list.");
      return; // Exit early
    }

    if (categoryId) {
      (async () => {
        const res = await fetch(
          `/admin/api/subcategories?categoryId=${categoryId}`
        );
        const data: Subcategory[] = await res.json();
        setSubcategoryList(data);

        if (prevCategoryId.current !== categoryId) {
          setSubcategoryId("");
        }

        prevCategoryId.current = categoryId;
        console.log("Subcategories:", data);
      })();
    }
  }, [categoryId]);

  return (
    <form action={formAction} className="space-y-8">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          type="text"
          id="name"
          required
          name="name"
          autoComplete="name"
          autoFocus
          defaultValue={product?.name || ""}
        />
        {state.errors?.name && (
          <div className="text-destructive">{state.errors.name}</div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={product?.description || ""}
        />
      </div>

      <div className="flex justify-items-start items-center gap-4">
        <div className="space-y-2">
          <p>Category</p>
          <Input
            type="hidden"
            name="categoryId"
            value={categoryId || ""}
          ></Input>
          <Combobox
            list={categoryList}
            setId={setCategoryId}
            selected={categoryId}
          />
          {state.errors?.categoryId && (
            <div className="text-sm text-red-500">
              {state.errors.categoryId}
            </div>
          )}
        </div>
        <div className="space-y-2">
          <p>Subcategory</p>
          <Input
            type="hidden"
            name="subcategoryId"
            value={subcategoryId || ""}
          ></Input>
          <Combobox
            list={subcategoryList}
            setId={setSubcategoryId}
            selected={subcategoryId}
          />
          {state.errors?.subcategoryId && (
            <div className="text-sm text-red-500">
              {state.errors.subcategoryId}
            </div>
          )}
        </div>
      </div>

      <div className="flex justify-items-start items-center gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Price</Label>
          <Input
            type="number"
            className="w-[200px]"
            name="price"
            id="price"
            required
            defaultValue={product?.price.toString() || ""}
          />
          {state.errors?.price && <div>{state.errors.price}</div>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            type="number"
            className="w-[200px]"
            id="quantity"
            required
            name="quantity"
            defaultValue={product?.quantity.toString() || ""}
            min="0"
          />
          {state.errors?.quantity && <p>{state.errors.quantity.join(", ")}</p>}
        </div>
      </div>

      <div className="space-y-2">
        <ImageUpload initialImage={product?.imageUrl} />
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
