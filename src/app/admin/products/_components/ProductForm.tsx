"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useActionState, useState } from "react";
import { addProduct } from "@/_actions/products";
import { useFormStatus } from "react-dom";

export default function ProductForm() {
  const [price, setPrice] = useState<number>(0);
  const [quantity, setQuantity] = useState<number>(0);

  const [state, formAction] = useActionState(addProduct, {
    success: false,
  });

  return (
    <form action={formAction} className="space-y-8">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input type="text" id="name" required name="name" />
        {state.errors?.name && <p>{state.errors.name.join(", ")}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="price">Price</Label>
        <Input
          type="number"
          name="price"
          id="price"
          required
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
        />
        {state.errors?.price && <p>{state.errors.price.join(", ")}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="quantity">Quantity</Label>
        <Input
          type="number"
          id="quantity"
          required
          name="quantity"
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
        {state.errors?.quantity && <p>{state.errors.quantity.join(", ")}</p>}
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          name="description"
          placeholder="Description"
          defaultValue={state.fields?.description}
        />
        {state.errors?.description && (
          <p>{state.errors.description.join(", ")}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="image">Image</Label>
        <Input type="file" id="image" required name="image" />
        {state.errors?.image && <p>{state.errors.image.join(", ")}</p>}
      </div>
      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save"}
    </Button>
  );
}
